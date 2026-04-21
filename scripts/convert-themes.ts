/**
 * Converts opencode TUI theme JSONs into findfile's FindfileTheme format.
 *
 * Reads from: packages/opencode/src/cli/cmd/tui/context/theme/*.json
 * Writes to:  src/tui/theme/presets.ts
 */

import { readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const SOURCE_DIR =
  "C:/Users/Patrick/opencode-source/packages/opencode/src/cli/cmd/tui/context/theme"

interface ThemeJson {
  defs?: Record<string, string>
  theme: Record<string, string | { dark?: string; light?: string }>
}

function resolveColor(
  value: string | { dark?: string; light?: string },
  defs: Record<string, string>,
  mode: "dark" | "light",
  chain: string[] = [],
): string {
  if (typeof value === "object") {
    const next = value[mode]
    if (next === undefined) return "#ff00ff"
    return resolveColor(next, defs, mode, chain)
  }

  if (value.startsWith("#")) return value
  if (value === "transparent" || value === "none") return "#000000"

  if (chain.includes(value)) {
    console.warn(`Circular reference: ${chain.join(" -> ")} -> ${value}`)
    return "#ff00ff"
  }

  const next = defs[value] ?? value
  if (next === undefined || next === value) {
    if (value.startsWith("#")) return value
    console.warn(`Unresolved color reference: ${value}`)
    return "#ff00ff"
  }
  return resolveColor(next, defs, mode, [...chain, value])
}

function convertTheme(name: string, json: ThemeJson): string {
  const defs = json.defs ?? {}
  const t = json.theme
  const d = (key: string, fallback = "#ff00ff"): string => {
    const val = t[key]
    if (val === undefined) return fallback
    try {
      return resolveColor(val, defs, "dark")
    } catch {
      return fallback
    }
  }

  const bg = d("background", "#0f172a")
  const fg = d("text", "#e2e8f0")
  const fgMuted = d("textMuted", "#94a3b8")
  const primary = d("primary", "#38bdf8")
  const accent = d("accent", primary)
  const secondary = d("secondary", accent)
  const error = d("error", "#ef4444")
  const warning = d("warning", "#fbbf24")
  const success = d("success", "#4ade80")
  const info = d("info", "#60a5fa")
  const border = d("border", "#334155")
  const borderActive = d("borderActive", border)
  const borderSubtle = d("borderSubtle", border)
  const bgPanel = d("backgroundPanel", bg)
  const bgElement = d("backgroundElement", bg)

  const syntaxComment = d("syntaxComment", fgMuted)
  const syntaxKeyword = d("syntaxKeyword", accent)
  const syntaxFunction = d("syntaxFunction", primary)
  const syntaxVariable = d("syntaxVariable", fg)
  const syntaxString = d("syntaxString", success)
  const syntaxNumber = d("syntaxNumber", warning)
  const syntaxType = d("syntaxType", info)
  const syntaxOperator = d("syntaxOperator", info)
  const syntaxPunctuation = d("syntaxPunctuation", fg)

  const surface = bgPanel
  const surfaceElevated = bgElement

  const matchFg = warning
  const matchBg = darken(matchFg, 0.6)

  return `export const ${name}Theme: FindfileTheme = {
  name: "${name}",
  primitives: {
    spacingUnit: 1,
    colors: {
      bg: "${bg}",
      fg: "${fg}",
      fgMuted: "${fgMuted}",
      fgDim: "${darken(fgMuted, 0.7)}",
      fgOnAccent: "${bg}",

      accent: "${accent}",
      accentBg: "${darken(accent, 0.25)}",
      accentBorder: "${accent}",

      success: "${success}",
      warning: "${warning}",
      error: "${error}",
      info: "${info}",

      border: "${border}",
      borderFocused: "${accent}",
      borderActive: "${borderActive}",

      surface: "${surface}",
      surfaceElevated: "${surfaceElevated}",

      matchFg: "${matchFg}",
      matchBg: "${matchBg}",

      markedFg: "${success}",
      scrollbarThumb: "${border}",
      scrollbarTrack: "${bg}",
    },
  },
  semantic: {
    app: { bg: "${bg}", fg: "${fg}" },
    input: {
      bg: "${surface}",
      fg: "${fg}",
      placeholderFg: "${darken(fgMuted, 0.7)}",
      border: "${border}",
      borderFocused: "${accent}",
      padding: 1,
      height: 3,
    },
    results: {
      bg: "${bg}",
      fg: "${fgMuted}",
      fgPath: "${darken(fgMuted, 0.8)}",
      fgLine: "${primary}",
      fgPreview: "${fgMuted}",
      selectedBg: "${surfaceElevated}",
      selectedFg: "${fg}",
      selectedFgPath: "${fgMuted}",
      markedFg: "${success}",
      markedIndicator: "${success}",
      matchFg: "${matchFg}",
      matchBg: "${matchBg}",
      border: "${border}",
      borderStyle: "single",
      titleFg: "${fgMuted}",
      padding: 1,
    },
    preview: {
      bg: "${bg}",
      fg: "${fg}",
      fgPath: "${fgMuted}",
      border: "${border}",
      borderStyle: "single",
      titleFg: "${fgMuted}",
      padding: 1,
    },
    status: {
      bg: "${bg}",
      fg: "${fgMuted}",
      fgMode: "${accent}",
      fgKey: "${darken(fgMuted, 0.6)}",
      fgCount: "${fgMuted}",
      height: 1,
    },
    scrollbar: {
      thumb: "${border}",
      track: "${bg}",
      width: 1,
    },
  },
  components: {},
}`
}

function darken(hex: string, amount: number): string {
  if (!hex.startsWith("#") || hex.length !== 7) return hex
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * amount)
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * amount)
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * amount)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

const files = readdirSync(SOURCE_DIR).filter((f) => f.endsWith(".json"))
const themes: string[] = []
const names: string[] = []

for (const file of files.sort()) {
  const raw = readFileSync(join(SOURCE_DIR, file), "utf-8")
  let json: ThemeJson
  try {
    json = JSON.parse(raw)
  } catch {
    console.warn(`Skipping invalid JSON: ${file}`)
    continue
  }
  const name = file.replace(".json", "").replace(/-/g, "")
  names.push(name)
  themes.push(convertTheme(name, json))
}

const header = `import type { FindfileTheme } from "./tokens.ts"

/* ------------------------------------------------------------------ */
/*  Built-in defaults                                                 */
/* ------------------------------------------------------------------ */

export const darkTheme: FindfileTheme = {
  name: "dark",
  primitives: {
    spacingUnit: 1,
    colors: {
      bg: "#0f172a",
      fg: "#e2e8f0",
      fgMuted: "#94a3b8",
      fgDim: "#64748b",
      fgOnAccent: "#0f172a",

      accent: "#38bdf8",
      accentBg: "#0c4a6e",
      accentBorder: "#38bdf8",

      success: "#4ade80",
      warning: "#fbbf24",
      error: "#ef4444",
      info: "#60a5fa",

      border: "#334155",
      borderFocused: "#38bdf8",
      borderActive: "#7dd3fc",

      surface: "#1e293b",
      surfaceElevated: "#334155",

      matchFg: "#fbbf24",
      matchBg: "#78350f",

      markedFg: "#4ade80",
      scrollbarThumb: "#334155",
      scrollbarTrack: "#0f172a",
    },
  },
  semantic: {
    app: {
      bg: "#0f172a",
      fg: "#e2e8f0",
    },
    input: {
      bg: "#1e293b",
      fg: "#e2e8f0",
      placeholderFg: "#475569",
      border: "#334155",
      borderFocused: "#38bdf8",
      padding: 1,
      height: 3,
    },
    results: {
      bg: "#0f172a",
      fg: "#aaaaaa",
      fgPath: "#64748b",
      fgLine: "#38bdf8",
      fgPreview: "#aaaaaa",
      selectedBg: "#334155",
      selectedFg: "#ffffff",
      selectedFgPath: "#94a3b8",
      markedFg: "#4ade80",
      markedIndicator: "#4ade80",
      matchFg: "#fbbf24",
      matchBg: "#78350f",
      border: "#334155",
      borderStyle: "single",
      titleFg: "#94a3b8",
      padding: 1,
    },
    preview: {
      bg: "#0f172a",
      fg: "#e2e8f0",
      fgPath: "#94a3b8",
      border: "#334155",
      borderStyle: "single",
      titleFg: "#94a3b8",
      padding: 1,
    },
    status: {
      bg: "#0f172a",
      fg: "#aaaaaa",
      fgMode: "#38bdf8",
      fgKey: "#666666",
      fgCount: "#94a3b8",
      height: 1,
    },
    scrollbar: {
      thumb: "#334155",
      track: "#0f172a",
      width: 1,
    },
  },
  components: {},
}

export const lightTheme: FindfileTheme = {
  name: "light",
  primitives: {
    spacingUnit: 1,
    colors: {
      bg: "#ffffff",
      fg: "#1e293b",
      fgMuted: "#64748b",
      fgDim: "#94a3b8",
      fgOnAccent: "#ffffff",

      accent: "#0284c7",
      accentBg: "#e0f2fe",
      accentBorder: "#0284c7",

      success: "#16a34a",
      warning: "#d97706",
      error: "#dc2626",
      info: "#2563eb",

      border: "#e2e8f0",
      borderFocused: "#0284c7",
      borderActive: "#38bdf8",

      surface: "#f8fafc",
      surfaceElevated: "#f1f5f9",

      matchFg: "#92400e",
      matchBg: "#fef3c7",

      markedFg: "#16a34a",
      scrollbarThumb: "#cbd5e1",
      scrollbarTrack: "#f1f5f9",
    },
  },
  semantic: {
    app: {
      bg: "#ffffff",
      fg: "#1e293b",
    },
    input: {
      bg: "#f8fafc",
      fg: "#1e293b",
      placeholderFg: "#94a3b8",
      border: "#e2e8f0",
      borderFocused: "#0284c7",
      padding: 1,
      height: 3,
    },
    results: {
      bg: "#ffffff",
      fg: "#475569",
      fgPath: "#94a3b8",
      fgLine: "#0284c7",
      fgPreview: "#475569",
      selectedBg: "#e0f2fe",
      selectedFg: "#0f172a",
      selectedFgPath: "#64748b",
      markedFg: "#16a34a",
      markedIndicator: "#16a34a",
      matchFg: "#92400e",
      matchBg: "#fef3c7",
      border: "#e2e8f0",
      borderStyle: "single",
      titleFg: "#64748b",
      padding: 1,
    },
    preview: {
      bg: "#ffffff",
      fg: "#1e293b",
      fgPath: "#64748b",
      border: "#e2e8f0",
      borderStyle: "single",
      titleFg: "#64748b",
      padding: 1,
    },
    status: {
      bg: "#ffffff",
      fg: "#64748b",
      fgMode: "#0284c7",
      fgKey: "#94a3b8",
      fgCount: "#64748b",
      height: 1,
    },
    scrollbar: {
      thumb: "#cbd5e1",
      track: "#f1f5f9",
      width: 1,
    },
  },
  components: {},
}

/* ------------------------------------------------------------------ */
/*  Imported from opencode TUI themes                                 */
/*  Source: sst/opencode — packages/opencode/src/cli/cmd/tui/context  */
/* ------------------------------------------------------------------ */
`

const body = themes.join("\n\n")

const footer = `
/* ------------------------------------------------------------------ */
/*  Preset map                                                        */
/* ------------------------------------------------------------------ */

export const themes: Record<string, FindfileTheme> = {
  dark: darkTheme,
  light: lightTheme,
${names.map((n) => `  ${n}: ${n}Theme,`).join("\n")}
}

export const defaultTheme = darkTheme
`

writeFileSync("src/tui/theme/presets.ts", header + "\n" + body + footer)
console.log(`Generated ${names.length + 2} themes in src/tui/theme/presets.ts`)
