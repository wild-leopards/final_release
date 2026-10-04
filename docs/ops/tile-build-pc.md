# Fast Tile Build on a Teammate's Gaming PC (Windows)

Why this exists: the minipc (N150, 4 threads, one SSD) needs ~6 h for the
full Europe archive and is I/O-bound the whole way. A desktop
(i9-12900KS, 32 GB RAM, NVMe) does a bounds-limited Europe build in
~45–60 min after the data download, and the bounded (~10–20 GB) archive
transfers to the minipc far sooner than the minipc's own build
finishes. The GPU is irrelevant — planetiler is pure CPU/RAM/disk.

Strategy: **parallel, not a replacement**. The minipc's full-Europe
build keeps running; the PC's bounds-limited archive is served on
**:8082** as early access (frontend just overrides `VITE_TILES_BASE`).
When the full archive lands on :8081, flip back. The bounded archive
then becomes the fallback if the big build ever dies.

Everything below runs on the PC (via AnyDesk), in PowerShell, except
the final step on the minipc.

## 1. One-time setup (~10 min)

```powershell
# JDK 21 (skip if java -version already shows 21)
winget install -e --id EclipseAdoptium.Temurin.21.JDK
# Python for the one-line file server in step 4 (skip if `py --version` works)
winget install -e --id Python.Python.3.12
# Reopen PowerShell after installs, then:
cd $HOME\Desktop
mkdir balkans-build; cd balkans-build
# Planetiler (same tool as the minipc)
curl.exe -L -o planetiler.jar https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar
```

## 2. Download the Geofabrik Europe extract (~30–60 min — start early)

```powershell
curl.exe -L -o europe-latest.osm.pbf https://download.geofabrik.de/europe-latest.osm.pbf
# Must be ~33 GB when done; if it dies, re-run (curl resumes with -C -):
# curl.exe -L -C - -o europe-latest.osm.pbf https://download.geofabrik.de/europe-latest.osm.pbf
```

## 3. Build the bounded archive (~45–60 min)

Planetiler does NOT auto-download its auxiliary datasets — without them
it dies with `lake_centerline.shp.zip does not exist`. Fetch them once
(exact filenames matter), from the folder containing `planetiler.jar`:

```powershell
mkdir data\sources -Force
# NOTE: use exactly these URLs — the old osmdata.openstreetmap.de links
# 404 now (planetiler itself switched to these mirrors). Sizes after
# download: ~78 MB / ~415 MB / ~888 MB. Or copy all three from the
# minipc's ~/osm/data/sources/ instead of downloading.
curl.exe -L -o data\sources\lake_centerline.shp.zip https://github.com/acalcutt/osm-lakelines/releases/download/v12/lake_centerline.shp.zip
curl.exe -L -o data\sources\natural_earth_vector.sqlite.zip https://naciscdn.org/naturalearth/packages/natural_earth_vector.sqlite.zip
curl.exe -L -o data\sources\water-polygons-split-3857.zip https://osmdata.openstreetmap.de/download/water-polygons-split-3857.zip
```

Then — the bounding-box flag is **`--bounds=minLon,minLat,maxLon,maxLat`**
(not `--bbox`; planetiler silently ignores unknown flags and builds ALL
of Europe — check the startup log says `bounds=-6.0,36.0,30.0,58.0`):

```powershell
# Western+Central Europe: UK, Iberia, France, Benelux, Germany, Italy,
# Alps, Poland, Czechia, Balkans, Baltics, Denmark, S. Scandinavia (~15-20 GB).
java -Xmx24g --enable-native-access=ALL-UNNAMED -jar planetiler.jar --osm-path=europe-latest.osm.pbf --output=europe.pmtiles --bounds=-6,36,30,58 --force
# Slow home upload (<=100 Mbps)? Tighter box (drops UK/Ireland/Iberia/most of France, ~10-13 GB):
#   --bounds=4,36,30,58
```

Verify the aux zips before building — osmdata.openstreetmap.de truncates
downloads sometimes (`zip END header not found` at startup = re-download):

```powershell
tar -tf data\sources\lake_centerline.shp.zip >$null; tar -tf data\sources\natural_earth_vector.sqlite.zip >$null; tar -tf data\sources\water-polygons-split-3857.zip >$null; echo ALL-OK
```

Notes:

- **Never pass `--download`** — it overrides `--osm-path` with the
  default Monaco area (same gotcha as the minipc runbook). The manual
  aux downloads above are the safe replacement.
- Wikidata translations are skipped by default (log: "no wikidata
  translations found") — labels still come from local OSM names. Fine.
- Java 21 or 25 both work; the native-access/Unsafe warnings are
  cosmetic, `--enable-native-access=ALL-UNNAMED` silences the first.
- Heap: `-Xmx24g` for a 32 GB machine (≈75 %). Never give it more than
  that on Windows — the OS + pagefile need the rest.
- "madvise not available" on Windows is expected — harmless.
- Success looks like a final log line with tile counts and a
  `europe.pmtiles` of roughly 10–20 GB (per the bounds chosen above).

## 4. Transfer to the minipc over the VPN (minutes)

On the PC — serve the folder (allow Python through the firewall prompt):

```powershell
py -m http.server 8000
```

On your Mac or directly on the minipc (use the PC's VPN IP; downloads
to a temp name, then atomic `mv` — the waiting `tiles-balkans` service
picks it up within 30 s of the rename):

```bash
ssh minipc
curl -o ~/osm/balkans/europe.pmtiles.part http://<PC-VPN-IP>:8000/europe.pmtiles
mv ~/osm/balkans/europe.pmtiles.part ~/osm/balkans/europe.pmtiles
curl -s http://localhost:8082/europe/tilejson.json | head -c 200   # verify
```

If the VPN only routes your laptop (not the minipc): download to the
Mac over the VPN, then `scp` to the minipc over the school LAN.

## 5. Point the frontend at the early-access server

On each demo/development machine, `.env.local`:

```bash
VITE_TILES_BASE=http://dminipc.local:8082
```

No code changes — the archive keeps the name `europe.pmtiles` so the
`/europe/tilejson.json` path matches. When the minipc's full-Europe
archive is ready (:8081 answers tilejson), delete that line to go back
to whole-Europe coverage; the bbox archive stays on :8082 as fallback.

## Minipc side (already set up, reference)

- `~/osm/serve-balkans.sh` + systemd unit `tiles-balkans` on :8082 —
  waits for `~/osm/balkans/europe.pmtiles` > 1 GB, then serves with
  CORS (mirrors the :8081 setup; see `docs/ops/minipc.md`).
