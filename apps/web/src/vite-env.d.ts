/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_ICE_SERVERS?: string;
  readonly VITE_ROM_SOURCE?: "bundled" | "upload";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
