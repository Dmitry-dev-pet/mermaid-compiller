/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_ENDPOINT: string;
  readonly VITE_OPEN_ROUTER_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
