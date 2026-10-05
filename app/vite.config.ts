import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GuyHadas Visibility OS - built as a static SPA, deployed to the
// "app" Firebase Hosting target (app.guyhadas.xyz). See firebase.json.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
