/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Where the API server lives when it isn't on the same address as the website, e.g. https://kulii-api.onrender.com */
  readonly VITE_API_URL?: string;
}
