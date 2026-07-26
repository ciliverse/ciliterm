/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHOWCASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.geojson?raw' {
  const content: string;
  export default content;
}
