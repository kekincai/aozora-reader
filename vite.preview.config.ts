import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local UI preview against the deployed read-only API; not used by build or deploy.
export default defineConfig({
  plugins: [react(), {
    name: 'drop-preview-analytics',
    configureServer(server) {
      server.middlewares.use('/api/analytics', (_request, response) => { response.statusCode = 204; response.end() })
    },
  }],
  // PREVIEW_API=http://localhost:8799 points at `wrangler dev --remote` to try Worker changes before deploying.
  server: { port: 5190, proxy: { '/api': { target: process.env.PREVIEW_API || 'https://aozora-reader.kekincai.workers.dev', changeOrigin: true } } },
})
