/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL, default http://dminipc.local:8080 (the minipc, mDNS). */
  readonly VITE_POWER_API_BASE?: string;
  /** PMTiles server base URL, default http://dminipc.local:8081. */
  readonly VITE_TILES_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
