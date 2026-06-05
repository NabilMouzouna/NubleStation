import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { resolve } from 'node:path'

const NUBLE_URL      = process.env.VITE_NUBLESTATION_URL          ?? 'http://api.nuble.local'
const NUBLE_KEY      = process.env.VITE_NUBLESTATION_API_KEY      ?? ''
const IDENTITY_URL   = process.env.VITE_NUBLESTATION_IDENTITY_URL ?? 'http://identity.nuble.local'
const APP_SLUG       = process.env.VITE_NUBLESTATION_APP          ?? 'bucket'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // Guarantee env vars are baked into the production bundle.
  // Vite's .env loading happens after config evaluation, so process.env reads
  // here only catch shell-exported vars. The define block bridges both cases.
  define: {
    'import.meta.env.VITE_NUBLESTATION_URL':          JSON.stringify(NUBLE_URL),
    'import.meta.env.VITE_NUBLESTATION_API_KEY':       JSON.stringify(NUBLE_KEY),
    'import.meta.env.VITE_NUBLESTATION_IDENTITY_URL':  JSON.stringify(IDENTITY_URL),
    'import.meta.env.VITE_NUBLESTATION_APP':           JSON.stringify(APP_SLUG),
  },
  resolve: {
    alias: {
      '@nublestation/vault':    resolve(__dirname, '../../packages/vault/dist/index.js'),
      '@nublestation/identity': resolve(__dirname, '../../packages/identity/dist/index.js'),
      '@nublestation/client':   resolve(__dirname, '../../packages/client/dist/index.js'),
    },
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
})
