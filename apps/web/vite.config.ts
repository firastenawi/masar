import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // كل طلبات /api تذهب إلى خادم Fastify، فلا حاجة لإعداد CORS
      "/api": "http://127.0.0.1:3001",
    },
  },
});
