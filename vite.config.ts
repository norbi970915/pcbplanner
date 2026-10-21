import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // Browser audits write downloads here; Windows can briefly lock them while saving.
  server: { watch: { ignored: ['**/dist-check/**', '**/.verification/**'] } },
})
