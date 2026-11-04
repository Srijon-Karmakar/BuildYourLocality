import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** While developing, ask Google for test ads only so nobody clicks live ads on their own site. */
const adTestMode = (): Plugin => ({
  name: 'adsense-test-mode',
  transformIndexHtml: {
    order: 'post',
    handler: (html, ctx) =>
      ctx.server ? html.replace('<script async src="https://pagead2', '<script async data-adbreak-test="on" src="https://pagead2') : html,
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), adTestMode()],
  build: {
    rolldownOptions: {
      // index.html is the game; home.html, about, contact and privacy are static content pages.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        practice: resolve(import.meta.dirname, 'practice.html'),
        home: resolve(import.meta.dirname, 'home.html'),
        about: resolve(import.meta.dirname, 'about.html'),
        contact: resolve(import.meta.dirname, 'contact.html'),
        privacy: resolve(import.meta.dirname, 'privacy.html'),
      },
      output: {
        // Big libraries get their own files: the page shell loads first, and a game update does not
        // make players download three.js and the physics engine again.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/](three|@types[\/]three)[\/]/, priority: 30 },
            { name: 'physics', test: /node_modules[\/](@dimforge|@react-three[\/]rapier)[\/]/, priority: 25 },
            { name: 'r3f', test: /node_modules[\/](@react-three|postprocessing|three-stdlib|troika|meshline|maath|camera-controls)[\/]/, priority: 20 },
            { name: 'supabase', test: /node_modules[\/]@supabase[\/]/, priority: 20 },
          ],
        },
      },
    },
  },
})
