// Plasmo 0.89.4 builds the world:"MAIN" content script (inpage.*.js) but drops
// its entry from the generated manifest, so the MAIN-world bridge never gets
// injected. This re-adds it after the build. Run for every build dir Plasmo
// produces (prod and, if present, dev).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const dirs = [
  "build/chrome-mv3-prod",
  "build/chrome-mv3-dev"
].filter(existsSync)

if (dirs.length === 0) {
  console.error("[patch-manifest] no build dir found")
  process.exit(1)
}

let patched = 0
for (const dir of dirs) {
  const manifestPath = join(dir, "manifest.json")
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const inpage = readdirSync(dir).find((f) => /^inpage\.[a-z0-9]+\.js$/i.test(f))
  if (!inpage) {
    console.error(`[patch-manifest] ${dir}: inpage.*.js not found, skipping`)
    continue
  }

  manifest.content_scripts = manifest.content_scripts || []
  const relay = manifest.content_scripts.find((c) =>
    (c.js || []).some((j) => /^relay\./.test(j))
  )
  const matches = (relay && relay.matches) || [
    "https://*.paraloom.io/*",
    "https://paraloom.io/*"
  ]

  const entry = {
    matches,
    js: [inpage],
    run_at: "document_start",
    world: "MAIN"
  }

  const existing = manifest.content_scripts.find((c) =>
    (c.js || []).some((j) => /^inpage\./.test(j))
  )
  if (existing) Object.assign(existing, entry)
  else manifest.content_scripts.push(entry)

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`[patch-manifest] ${dir}: registered MAIN-world ${inpage}`)
  patched++
}

if (patched === 0) process.exit(1)
