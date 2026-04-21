import type { SearchResult } from "./schema.ts"

export type Format = "path" | "line" | "json" | "null"
export type ColorMode = "always" | "auto" | "never"

const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const RED = "\x1b[31m"
const GREEN = "\x1b[32m"
const CYAN = "\x1b[36m"

export const resolveColor = (mode: ColorMode, isTty: boolean): boolean => {
  if (mode === "always") return true
  if (mode === "never") return false
  return isTty
}

const highlightRanges = (
  preview: string,
  ranges: ReadonlyArray<readonly [number, number]> | undefined,
  useColor: boolean,
): string => {
  if (!useColor || !ranges || ranges.length === 0) return preview
  const sorted = [...ranges]
    .filter(([s, e]) => e > s && s >= 0)
    .sort((a, b) => a[0] - b[0])
  if (sorted.length === 0) return preview
  let out = ""
  let cursor = 0
  for (const [start, end] of sorted) {
    if (start < cursor) continue
    if (start >= preview.length) break
    const clampEnd = Math.min(end, preview.length)
    out += preview.slice(cursor, start)
    out += `${BOLD}${RED}${preview.slice(start, clampEnd)}${RESET}`
    cursor = clampEnd
  }
  out += preview.slice(cursor)
  return out
}

const MAX_PREVIEW = 200

export const formatResult = (
  r: SearchResult,
  format: Format,
  useColor: boolean,
): string => {
  switch (format) {
    case "null":
      return `${r.relativePath}\0`
    case "json":
      return `${JSON.stringify(r)}\n`
    case "path":
      return useColor
        ? `${CYAN}${r.relativePath}${RESET}\n`
        : `${r.relativePath}\n`
    case "line": {
      if (r.match === undefined) {
        return useColor
          ? `${CYAN}${r.relativePath}${RESET}\n`
          : `${r.relativePath}\n`
      }
      const preview = r.match.preview.slice(0, MAX_PREVIEW)
      const highlighted = highlightRanges(preview, r.match.ranges, useColor)
      const pathStr = useColor
        ? `${CYAN}${r.relativePath}${RESET}`
        : r.relativePath
      const locStr = useColor
        ? `${GREEN}${r.match.line}${RESET}:${GREEN}${r.match.col}${RESET}`
        : `${r.match.line}:${r.match.col}`
      return `${pathStr}:${locStr}\t${highlighted}\n`
    }
  }
}
