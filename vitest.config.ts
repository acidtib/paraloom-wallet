import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// `~` is the alias Plasmo/tsconfig already use for the repo root (`~lib/...`),
// so tests import the same specifiers the extension code does.
export default defineConfig({
  resolve: {
    // A regex, not a string key: Vite's string aliases only match `~` or
    // `~/...`, and every import in this repo is the boundary-less `~lib/...`.
    alias: [{ find: /^~/, replacement: fileURLToPath(new URL("./", import.meta.url)) }]
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
})
