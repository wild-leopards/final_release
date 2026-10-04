# Memory Index

- [Shared repo memory](shared-repo-memory.md) — agent memory lives in `.claude/memory/` in this repo, committed & pushed; per-machine override required
- [Win machine: no git client](win-machine-no-git.md) — git not on PATH here (user runs commits); E2E via headless Edge + playwright-core in tmp/e2e
- [Mac E2E: headless Chrome + raw CDP](mac-e2e-headless-chrome.md) — zero-install visual testing; swiftshader flags required or WebGL2 crash empties #root; vite preview binds [::1] so use localhost; React selects via native value setter + change event; isolated --user-data-dir + park on about:blank or the GPU helper burns CPU
- [Mega-merge 2026-10-04: merged, verified, PUSH PENDING](mega-merge-pending.md) — 4 rebased WP commits on main (a56448a/643f353/6aaba30/cd7e6fa), lint+build+E2E green; PM's word gates the push; dots files deleted in favor of DataOverlays; INTRO_STREET_MAP toggle is the intro merge contract
- [minipc: ssh via mDNS, not IP](minipc-mdns-ssh.md) — hotspot IP changes between networks; alias points at dminipc.local
- [Never commit without being told](never-commit-without-saying.md) — user runs all commits; never git commit/push unless explicitly asked
