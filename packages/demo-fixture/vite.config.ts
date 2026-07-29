import react from "@vitejs/plugin-react";
import { vemSourceAnchor } from "@vem/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vemSourceAnchor({ projectRoot: import.meta.dirname, sourceRegistryRevision: "p0-t15-demo-dev" }),
    react(),
  ],
  build: {
    emptyOutDir: true,
    sourcemap: true,
  },
});
