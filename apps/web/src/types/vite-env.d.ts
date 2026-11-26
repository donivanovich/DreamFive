/// <reference types="vite/client" />

/**
 * Variables de entorno públicas expuestas al navegador por Vite.
 * Solo se permiten variables con prefijo VITE_ y nunca deben contener secretos.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PUBLIC_URL?: string;
  readonly VITE_DEV_TOOLS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
