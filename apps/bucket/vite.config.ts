import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv reads .env files (with empty prefix → all keys, incl. shell vars)
  // into a plain object. process.env alone misses .env files in config scope,
  // which left VITE_NUBLESTATION_API_KEY empty and broke uploads.
  const env = loadEnv(mode, process.cwd(), '')
  const NUBLE_URL      = env.VITE_NUBLESTATION_URL          ?? 'http://api.nuble.local'
  const NUBLE_KEY      = env.VITE_NUBLESTATION_API_KEY      ?? ''
  const IDENTITY_URL   = env.VITE_NUBLESTATION_IDENTITY_URL ?? 'http://identity.nuble.local'
  const APP_SLUG       = env.VITE_NUBLESTATION_APP          ?? 'bucket'

  return {
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // Guarantee env vars are baked into the production bundle.
  define: {
    'import.meta.env.VITE_NUBLESTATION_URL':          JSON.stringify(NUBLE_URL),
    'import.meta.env.VITE_NUBLESTATION_API_KEY':       JSON.stringify(NUBLE_KEY),
    'import.meta.env.VITE_NUBLESTATION_IDENTITY_URL':  JSON.stringify(IDENTITY_URL),
    'import.meta.env.VITE_NUBLESTATION_APP':           JSON.stringify(APP_SLUG),
  },
  server: {
    // Proxy all /v1/* requests to the NubleStation gateway so the browser
    // never crosses origins — CORS is a browser constraint, not a server one.
    proxy: {
      '/v1': {
        target: NUBLE_URL,
        changeOrigin: true,
      },
    },
  },
  }
})
