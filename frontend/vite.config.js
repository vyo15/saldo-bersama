import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(frontendRoot, "..");

export default defineConfig({
  envDir: projectRoot,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 650,
  },
});
