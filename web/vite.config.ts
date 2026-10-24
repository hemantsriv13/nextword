import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The Python backend (python -m nextword.lab) serves web/dist and the API on port 8765.
// During development, `npm run dev` proxies /api to it.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:8765" },
  },
  worker: { format: "es" },
})
