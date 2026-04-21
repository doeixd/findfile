import ignore from "ignore"
import type { SearchFilters, SearchResult } from "./schema.ts"

const TYPE_GLOBS: Record<string, readonly string[]> = {
  ts: ["*.ts", "*.tsx", "*.mts", "*.cts"],
  tsx: ["*.tsx"],
  js: ["*.js", "*.jsx", "*.mjs", "*.cjs"],
  jsx: ["*.jsx"],
  py: ["*.py", "*.pyi"],
  md: ["*.md", "*.markdown"],
  rust: ["*.rs"],
  rs: ["*.rs"],
  go: ["*.go"],
  json: ["*.json", "*.jsonc"],
  yaml: ["*.yaml", "*.yml"],
  yml: ["*.yaml", "*.yml"],
  toml: ["*.toml"],
  sh: ["*.sh", "*.bash", "*.zsh", "*.fish"],
  bash: ["*.sh", "*.bash"],
  css: ["*.css", "*.scss", "*.sass", "*.less"],
  html: ["*.html", "*.htm"],
  sql: ["*.sql"],
  c: ["*.c", "*.h"],
  cpp: ["*.cpp", "*.cc", "*.cxx", "*.hpp", "*.hh"],
  java: ["*.java"],
  ruby: ["*.rb"],
  rb: ["*.rb"],
  php: ["*.php"],
  lua: ["*.lua"],
  zig: ["*.zig"],
  swift: ["*.swift"],
  kt: ["*.kt", "*.kts"],
}

export const expandTypes = (types: readonly string[]): string[] => {
  const out: string[] = []
  for (const t of types) {
    const expansion = TYPE_GLOBS[t.toLowerCase()]
    if (expansion) out.push(...expansion)
    else out.push(`*.${t.replace(/^\./, "")}`)
  }
  return out
}

export const compileGlobs = (
  globs: readonly string[],
): ((relPath: string) => boolean) => {
  if (globs.length === 0) return () => true
  const positives: string[] = []
  const negatives: string[] = []
  for (const g of globs) {
    if (g.startsWith("!")) negatives.push(g.slice(1))
    else positives.push(g)
  }
  const posIg =
    positives.length > 0 ? ignore({ allowRelativePaths: true }).add(positives) : null
  const negIg =
    negatives.length > 0 ? ignore({ allowRelativePaths: true }).add(negatives) : null
  return (relPath) => {
    const normalized = relPath.replace(/\\/g, "/")
    if (posIg && !posIg.ignores(normalized)) return false
    if (negIg && negIg.ignores(normalized)) return false
    return true
  }
}

export const pathDepth = (relPath: string): number => {
  const normalized = relPath.replace(/\\/g, "/")
  let depth = 0
  for (const ch of normalized) if (ch === "/") depth++
  return depth
}

const DURATION_RE = /^(\d+)\s*(s|m|h|d|w)(ec|in|r|ay|eek)?s?$/i
const UNIT_SEC: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
}

export const parseModifiedSince = (
  raw: string,
  now: Date = new Date(),
): number | null => {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed)
    if (!Number.isNaN(d.getTime())) return Math.floor(d.getTime() / 1000)
  }
  const m = DURATION_RE.exec(trimmed)
  if (!m) return null
  const n = Number.parseInt(m[1]!, 10)
  const unit = m[2]!.toLowerCase()
  const sec = UNIT_SEC[unit]
  if (sec === undefined) return null
  return Math.floor(now.getTime() / 1000) - n * sec
}

const WORD_RE = /\w/

const hasWordBoundaryMatch = (
  preview: string,
  ranges: ReadonlyArray<readonly [number, number]> | undefined,
): boolean => {
  if (!ranges || ranges.length === 0) return true
  for (const [start, end] of ranges) {
    const before = start === 0 || !WORD_RE.test(preview[start - 1] ?? "")
    const after = end >= preview.length || !WORD_RE.test(preview[end] ?? "")
    if (before && after) return true
  }
  return false
}

const normalizePath = (p: string): string => p.replace(/\\/g, "/")

export const buildFilter = (
  filters: SearchFilters | undefined,
  findfileIgnore?: (relPath: string) => boolean,
): ((r: SearchResult) => boolean) => {
  if (!filters && !findfileIgnore) return () => true
  const allGlobs = [
    ...(filters?.globs ?? []),
    ...expandTypes(filters?.types ?? []),
  ]
  const globMatch = compileGlobs(allGlobs)
  const maxDepth = filters?.maxDepth
  const mtimeCutoff = filters?.modifiedSinceSec
  const wordOnly = filters?.wordBoundary === true
  const allowlist =
    filters?.pathAllowlist && filters.pathAllowlist.length > 0
      ? new Set(filters.pathAllowlist.map(normalizePath))
      : null
  return (r) => {
    if (findfileIgnore && findfileIgnore(r.relativePath)) return false
    if (allowlist && !allowlist.has(normalizePath(r.relativePath))) return false
    if (!globMatch(r.relativePath)) return false
    if (maxDepth !== undefined && pathDepth(r.relativePath) > maxDepth) return false
    if (
      mtimeCutoff !== undefined &&
      r.modifiedSec !== undefined &&
      r.modifiedSec < mtimeCutoff
    ) {
      return false
    }
    if (wordOnly && r.match !== undefined) {
      if (!hasWordBoundaryMatch(r.match.preview, r.match.ranges)) return false
    }
    return true
  }
}
