import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Local export: bind only to loopback; the Studio sandbox has its own proxy.
  server: { host: "127.0.0.1" },
})
