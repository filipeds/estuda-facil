import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "demo" ? "/estuda-facil/" : "/",
  server: {
    port: 5173,
  },
}));
