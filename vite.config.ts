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
    rollupOptions: {
      // index.html is the static landing page; the game itself lives at play.html.
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play.html'),
        about: resolve(__dirname, 'about.html'),
        contact: resolve(__dirname, 'contact.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
})
