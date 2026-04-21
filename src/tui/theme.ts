import { SyntaxStyle } from "@opentui/core"

const defaultRules = [
  { scope: ["default"], style: { foreground: "#e2e8f0" } },
  { scope: ["comment"], style: { foreground: "#64748b", italic: true } },
  { scope: ["string", "symbol"], style: { foreground: "#a5d6ff" } },
  { scope: ["number", "boolean"], style: { foreground: "#79c0ff" } },
  { scope: ["keyword.return", "keyword.function", "keyword.control"], style: { foreground: "#ff7b72", italic: true } },
  { scope: ["keyword.type"], style: { foreground: "#ff7b72", bold: true } },
  { scope: ["keyword"], style: { foreground: "#ff7b72" } },
  { scope: ["operator"], style: { foreground: "#ff7b72" } },
  { scope: ["punctuation"], style: { foreground: "#c9d1d9" } },
  { scope: ["variable"], style: { foreground: "#e2e8f0" } },
  { scope: ["function"], style: { foreground: "#d2a8ff" } },
  { scope: ["type"], style: { foreground: "#ffa657" } },
  { scope: ["tag"], style: { foreground: "#7ee787" } },
  { scope: ["attribute"], style: { foreground: "#79c0ff" } },
  { scope: ["property"], style: { foreground: "#79c0ff" } },
  { scope: ["constant"], style: { foreground: "#79c0ff" } },
]

export const defaultSyntaxStyle = SyntaxStyle.fromTheme(defaultRules)

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "typescript",
  ".jsx": "typescript",
  ".mjs": "typescript",
  ".cjs": "typescript",
  ".json": "json",
  ".jsonc": "json",
  ".md": "markdown",
  ".markdown": "markdown",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".fish": "bash",
  ".css": "css",
  ".scss": "css",
  ".html": "html",
  ".htm": "html",
  ".sql": "sql",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".lua": "lua",
  ".zig": "zig",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
}

export const extToLang = (filePath: string): string => {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase()
  return EXT_TO_LANG[ext] ?? "none"
}
