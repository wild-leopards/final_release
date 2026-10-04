---
name: minipc-mdns-ssh
description: "minipc hotspot IP changes between networks — always ssh via dminipc.local / the minipc alias, never the IP"
metadata: 
  node_type: memory
  type: project
  originSessionId: e58163bb-2f54-4199-8d3f-013128d66569
  modified: 2026-10-03T13:03:41.010Z
---

The minipc's DHCP address changes whenever the team switches networks
(2026-10-03: 172.20.10.2 on the phone hotspot → 10.66.54.168 later the
same day). `ssh minipc` on this Mac is pointed at `dminipc.local`
(mDNS) in `~/.ssh/config`, so the alias keeps working; `dminipc.local`
is also pinned in known_hosts (fingerprint verified 2026-10-03).

**Why:** ssh-by-IP silently breaks (connect timeout) when the network
changes, which looks like the minipc being down when it isn't.

**How to apply:** if `ssh minipc` times out, don't assume the box is
down — check `ping dminipc.local` first. The frontend's
VITE_POWER_API_BASE / VITE_TILES_BASE defaults already use the mDNS
name and are immune.
