#!/usr/bin/env bun
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import path from "node:path"

const targets = [
  { target: "bun-linux-x64", outfile: "dist/findfile-linux-x64" },
  { target: "bun-linux-arm64", outfile: "dist/findfile-linux-arm64" },
  { target: "bun-darwin-arm64", outfile: "dist/findfile-darwin-arm64" },
  { target: "bun-windows-x64", outfile: "dist/findfile-windows-x64.exe" },
] as const

type BunBuildTarget = typeof targets[number]["target"]

const entry = path.resolve("src/bin/findfile.ts")

const bunPlatform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "darwin"
      : process.platform === "linux"
        ? "linux"
        : null

const only = process.argv.includes("--host")
  ? targets.filter(
      (t) => bunPlatform !== null && t.target === `bun-${bunPlatform}-${process.arch}`,
    )
  : targets

if (only.length === 0) {
  console.error(
    `no build target matched host bun-${bunPlatform ?? process.platform}-${process.arch}`,
  )
  process.exit(1)
}

// qmd and its native deps are runtime-optional. We externalize them so
// the compiled binary doesn't try to bundle platform-specific prebuilds
// it can't resolve. At runtime `import("@tobilu/qmd")` will either
// succeed (user has it installed alongside the binary) or fail with
// QmdUnavailableError → semantic mode disabled in the UI.
const externals = [
  "@tobilu/qmd",
  "node-llama-cpp",
  "better-sqlite3",
  "sqlite-vec",
]

const solidPlugin = createSolidTransformPlugin()

for (const { target, outfile } of only) {
  console.log(`→ ${target}  →  ${outfile}`)
  const result = await Bun.build({
    entrypoints: [entry],
    compile: { target: target as BunBuildTarget, outfile },
    external: externals,
    plugins: [solidPlugin],
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}
