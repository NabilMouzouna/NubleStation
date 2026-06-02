import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      // Point Vite at the pre-built dist so it doesn't need to resolve .ts sources.
      // Run `pnpm --filter @nublestation/vault build` and
      //     `pnpm --filter @nublestation/client build` after any SDK changes.
      '@nublestation/vault':  resolve(__dirname, '../../packages/vault/dist/index.js'),
      '@nublestation/client': resolve(__dirname, '../../packages/client/dist/index.js'),
    },
  },
})
