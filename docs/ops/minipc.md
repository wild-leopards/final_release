# Minipc — Backend Deployment Machine

The project's backend (Java / NASA POWER service, see `docs/backend/`) is
deployed to a team minipc referred to as **dminipc** (shorthand: "minipc").

## Hardware & System

| Item | Value |
|---|---|
| Hostname | `dminipc` (referred to as "minipc") |
| OS | Debian 13.7 amd64 — Cinnamon 6.4.10 desktop (fresh install) |
| CPU | Intel N150 — 4 cores / 4 threads, up to 3.6 GHz |
| RAM | 12,280 MB (BIOS) / ~11.4 GB (Debian) |
| Storage | 512.1 GB SSD (mostly free — fresh install) |
| Graphics | Intel integrated |
| BIOS | AMI Aptio / UEFI |
| Network | 2× LAN ports, Intel CNVi WiFi, 3× USB-A (3.0/3.1), 1× DP, 2× HDMI |

## Install Notes

- Debian was installed with the **SSH** option only — the "Web server"
  task was deliberately **not** selected. Install web-hosting packages
  manually when needed; keep the machine lean.
- Toolchain was installed on 2026-10-03 (see "Setup" below); anything
  beyond that is still not installed.

## Role in the Project

Target host for the Java backend service (and, later, the OpenStreetMap
tile server and possibly static frontend serving). Deployment flow:
rsync + rebuild — see `docs/backend/deployment.md`.

## Setup (done 2026-10-03)

- SSH access from the team Macs: key-based (`~/.ssh/id_ed25519` on the
  Mac, alias `minipc`). Password logins still work on the console.
- `dariboz` is in the `sudo` group; `/etc/sudoers.d/010-dariboz-nopasswd`
  grants NOPASSWD sudo (LAN hackathon box — remove after the event if
  wanted: `sudo rm /etc/sudoers.d/010-dariboz-nopasswd`).
- Installed via apt: `git`, `curl`, `wget`, `openjdk-21-jdk-headless`
  (compiles the pom's release-17 target fine), `maven`.
- Repo cloned to `~/project` over SSH using a **read-only GitHub deploy
  key** (`dminipc`, added to the org repo's deploy keys).
- Backend runs as systemd service **`powerapi`** (`0.0.0.0:8080`) —
  see `docs/backend/deployment.md`.
- **mDNS installed** (`avahi-daemon` + `libnss-mdns`): the machine is
  reachable as **`dminipc.local`** from macOS/Linux regardless of which
  IP the hotspot assigns. The frontend defaults its backend/tile URLs
  to this name.
- OpenStreetMap data lives in `~/osm/`:
  - `europe-latest.osm.pbf` — Geofabrik Europe extract (33 GB),
    downloaded with the self-resuming `resume-download.sh`.
  - `planetiler.jar` + `build-tiles.sh` — build `europe.pmtiles`
    (OpenMapTiles schema, z0–14). Europe needs ~10 GB heap; the box
    runs 9G + `--force` with a 16 GB swapfile (`/swapfile`) for
    headroom. Beware: `--download` overrides `--osm-path` with the
    default `monaco` area — keep aux datasets cached in `data/sources/`
    and don't use it.
  - A second archive route exists: systemd service **`tiles-balkans`**
    serves a Balkans-bounded early-access archive on **:8082** (built
    fast on a teammate's gaming PC — see `docs/ops/tile-build-pc.md`);
    the frontend opts in via `VITE_TILES_BASE=http://dminipc.local:8082`.
  - pmtiles v1.31 serves a *directory* of archives: route `/europe/…`
    maps to `<serve-root>/europe/*.pmtiles` symlinks — `tiles` serves
    the root `~/osm` (so `~/osm/europe/tilejson.pmtiles` → the 28 GB
    archive), `tiles-balkans` serves `~/osm/balkans/serve`. Gotcha:
    `pgrep -f planetiler.jar` matches your own ssh probe — use
    `pgrep -f "planetiler[.]jar"`.
  - `pmtiles` CLI (v1.31.2) + systemd service **`tiles`**: serves the
    archive on `0.0.0.0:8081` with CORS (`~/osm/serve-tiles.sh`). The
    script waits for a *complete* archive — planetiler pre-creates the
    output file at startup, so it checks "no planetiler process running
    AND file > 1 GB" rather than mere existence (a naive existence
    check crash-loops serving the 16 KB stub).

## Notes

- The machine's IP is DHCP and **changes with the network** (was
  172.20.10.2 on the phone hotspot, 10.66.54.168 on the current one) —
  always use `dminipc.local` (mDNS) or the `minipc` ssh alias, which is
  pointed at the mDNS name for exactly this reason.
