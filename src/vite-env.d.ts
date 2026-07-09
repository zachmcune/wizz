/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_URL?: string;
}

declare const __SANDBOX_ENABLED__: boolean;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
