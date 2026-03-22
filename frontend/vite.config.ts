// Vite configuration for Numa Mindcare frontend.
// In dev, proxies /api/v1 requests to the Express backend so the Axios
// baseURL of "/api/v1" works without CORS issues.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
