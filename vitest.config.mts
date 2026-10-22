import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same "@/..." shortcut as tsconfig.json, so tests can import app routes.
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});
