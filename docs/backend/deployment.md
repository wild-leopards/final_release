# Backend HTTP API & Deployment

The backend is a small Java HTTP service (`src/main/java/com/example/`)
that proxies NASA POWER satellite data for the frontend. It runs on the
team minipc as a systemd service.

## HTTP API

All endpoints except `POST /api/explain` are GET; all return JSON, and send
`Access-Control-Allow-Origin: *` so the dev-time frontend (different
origin) can call them directly.

### `GET /api/health`

Liveness probe. → `{"status":"ok"}`

### `GET /api/solar?lat&lon&start&end`

Daily all-sky surface shortwave downward radiation
(`ALLSKY_SFC_SW_DWN`, kWh/m²/day) for a point.

- `lat`, `lon` — required, degrees
- `start`, `end` — optional, `YYYYMMDD`; default to the last 30 days
- Unit conversion (2026-10-03): POWER's current responses report this
  parameter as daily-mean W/m² (`"units": "W m-2"` in the header); the
  backend converts × 0.024 to the kWh/m²/day contract and clamps to
  the physical max 8.

```json
{
  "request": {"lat": 42.7, "lon": 23.3, "start": "20260901", "end": "20260930"},
  "daily": {"20260901": 4.76, "20260902": 5.38},
  "stats": {"count": 28, "avg": 4.32, "min": 1.57, "max": 5.92, "total": 112.36}
}
```

### `GET /api/weather?lat&lon&parameters&start&end`

Same shape, but `parameters` is a comma-separated list of POWER
parameters (default `T2M`); the response nests one date-map per
parameter under `parameters`.

- The pseudo-parameter `ELEV` is served from the response geometry
  (POWER rejects a real `ELEV` parameter with 422): a constant series
  on the end date carrying the grid-cell elevation in meters.
- Known parameters are sanity-clamped: T2M −50..50 °C, ELEV
  −400..9000 m, WS2M 0..40 m/s, RH2M 0..100 %, PRECTOTCORR 0..200
  mm/day.

```json
{
  "request": {"lat": 42.7, "lon": 23.3, "parameters": "T2M,WS2M,RH2M,PRECTOTCORR,ELEV", "start": "20260901", "end": "20260930"},
  "parameters": {
    "T2M": {"20260901": 24.08},
    "WS2M": {"20260901": 0.9},
    "RH2M": {"20260901": 45.37},
    "PRECTOTCORR": {"20260901": 0.5},
    "ELEV": {"20260930": 834.82}
  }
}
```

### `GET /api/climatology?lat&lon`

NASA POWER long-term monthly climatology (`temporal/climatology/point`)
for T2M (°C), ALLSKY_SFC_SW_DWN (kWh/m²/day, same unit normalization +
clamp as `/api/solar`) and WS2M (m/s). The frontend uses it for annual
normals and seasonal (monthly) timeline values.

```json
{"request":{"lat":52.5,"lon":13.4},
 "parameters":{"T2M":{"monthly":[-0.73,0.4,…,0.86],"annual":9.68},
               "ALLSKY_SFC_SW_DWN":{"monthly":[0.64,…],"annual":2.83},
               "WS2M":{"monthly":[3.54,…],"annual":3.02}}}
```

### `POST /api/explain`

Plain-language explanation of a dashboard snapshot via Google Gemini
(`ExplainService.java`, JDK `java.net.http`, no SDK).

- Body: the JSON snapshot built by `src/lib/explain.ts`
  (`buildExplainSnapshot`), max 16 KB. → `{"text","cached","model"}`.
- A fixed system prompt (in `ExplainService.SYSTEM_PROMPT`) forbids
  computing new numbers: the model only explains the given values,
  respects the REAL/DERIVED/SYNTHETIC labels, and answers in English in
  120–180 words.
- Rate limit 10 requests/min per client IP (`429`), 15 s timeout per Gemini attempt (a timed-out primary falls back too; `504` if both time out), LRU cache (200 entries) keyed by SHA-256 of the
  key-sorted snapshot, CORS preflight (`OPTIONS`) handled.
- `503` when `GEMINI_API_KEY` is unset; `502` on upstream errors (on Gemini 503/429 "overloaded" the request is retried once on `GEMINI_FALLBACK_MODEL`, default `gemini-3.5-flash-lite`).

Env vars (systemd unit): `GEMINI_API_KEY` (required for explain, never
in the frontend), `GEMINI_MODEL` (default `gemini-3.5-flash`). Set them
with a drop-in:

```bash
ssh minipc 'sudo systemctl edit powerapi'
# [Service]
# Environment=GEMINI_API_KEY=...
# Environment=GEMINI_MODEL=gemini-3.5-flash
ssh minipc 'sudo systemctl restart powerapi'
```

Errors: `400` with `{"error": ...}` for bad/missing query params,
`502` when the NASA POWER upstream fails or returns no usable data.

## Running locally

```bash
mvn clean package
java -jar target/project-0.0.1-SNAPSHOT-jar-with-dependencies.jar
# PORT env var overrides the default 8080
```

## Deploying to the minipc

The minipc clone (`~/project`) is deployed by rsyncing sources from a
dev machine and rebuilding there (no JDK needed on dev machines):

```bash
rsync -a --delete src/main/java/ minipc:~/project/src/main/java/
rsync -a pom.xml minipc:~/project/
ssh minipc 'cd ~/project && mvn -q clean package -DskipTests && sudo systemctl restart powerapi'
```

(`minipc` = SSH alias for `dariboz@172.20.10.2`; the machine also
resolves as `dminipc.local` via mDNS — see
[docs/ops/minipc.md](../ops/minipc.md).)

The service unit `/etc/systemd/system/powerapi.service` runs the jar as
`dariboz`, `Restart=on-failure`, enabled at boot. Logs:
`ssh minipc 'journalctl -u powerapi -f'`.

The minipc's GitHub deploy key is read-only, so `git pull` also works
there once changes are pushed.

## Code layout

| File | Role |
|---|---|
| `src/main/java/com/example/PowerApiServer.java` | HTTP server, endpoints, CORS, JSON responses |
| `src/main/java/com/example/PowerApiService.java` | NASA POWER client (daily + climatology) + response parsing |
| `src/main/java/com/example/ExplainService.java` | Gemini client, system prompt, rate limit, cache |

Tests: `mvn test` (no Maven on the Macs — run on the minipc against a
synced copy: `rsync -a src/main src/test minipc:/tmp/kt/src/ && rsync pom.xml minipc:/tmp/kt/ && ssh minipc 'cd /tmp/kt && mvn -q test'`).

`mainClass` in `pom.xml` is `com.example.PowerApiServer`.
