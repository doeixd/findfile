import path from "node:path"
import fs from "node:fs"
import type { SearchResult } from "#core/schema.ts"

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type SubmitActionName = "print" | "open" | "copy" | "navigate" | "custom"

export interface SubmitAction {
  readonly type: SubmitActionName
  readonly customCmd?: string
}

export const SUBMIT_ACTIONS: readonly SubmitActionName[] = [
  "print",
  "open",
  "copy",
  "navigate",
  "custom",
] as const

/* ------------------------------------------------------------------ */
/*  Cycling                                                           */
/* ------------------------------------------------------------------ */

export const cycleSubmitAction = (
  current: SubmitActionName,
  customAvailable: boolean,
): SubmitActionName => {
  const available = customAvailable
    ? SUBMIT_ACTIONS
    : SUBMIT_ACTIONS.filter((a) => a !== "custom")
  const idx = available.indexOf(current)
  return available[idx >= 0 ? (idx + 1) % available.length : 0]!
}

export const getActionLabel = (action: SubmitAction): string => {
  switch (action.type) {
    case "print":
      return "Print"
    case "open":
      return "Open"
    case "copy":
      return "Copy"
    case "navigate":
      return "Navigate"
    case "custom":
      return "Custom"
  }
}

/* ------------------------------------------------------------------ */
/*  Outcome types — what startTui should do after submit              */
/* ------------------------------------------------------------------ */

export type SubmitOutcome =
  | { type: "print" }
  | { type: "navigate"; dir: string }
  | { type: "spawn"; cmd: string[] }
  | { type: "osc52"; text: string }
  | { type: "clipboard"; text: string; cmd: string[] }

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const base64Encode = (text: string): string => {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf-8").toString("base64")
  return btoa(text)
}

const resolveDir = (resultPath: string): string => {
  try {
    const stat = fs.statSync(resultPath)
    if (stat.isDirectory()) return resultPath
  } catch {
    // fall through
  }
  return path.dirname(resultPath)
}

const openCommand = (filePath: string): string[] => {
  const platform = process.platform
  if (platform === "darwin") return ["open", filePath]
  if (platform === "win32") return ["explorer", filePath]
  return ["xdg-open", filePath]
}

const clipboardCommand = (): string[] | null => {
  const platform = process.platform
  if (platform === "darwin") return ["pbcopy"]
  if (platform === "win32") return ["clip"]
  // Linux — try Wayland first, then X11
  if (platform === "linux") {
    try {
      Bun.spawnSync(["wl-copy", "--version"], { stdout: "ignore", stderr: "ignore" })
      return ["wl-copy"]
    } catch {
      // ignore
    }
    try {
      Bun.spawnSync(["xclip", "-version"], { stdout: "ignore", stderr: "ignore" })
      return ["xclip", "-selection", "clipboard"]
    } catch {
      // ignore
    }
    try {
      Bun.spawnSync(["xsel", "--version"], { stdout: "ignore", stderr: "ignore" })
      return ["xsel", "--clipboard", "--input"]
    } catch {
      // ignore
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Main resolver                                                     */
/* ------------------------------------------------------------------ */

export const getSubmitOutcome = (
  action: SubmitAction,
  results: readonly SearchResult[],
): SubmitOutcome => {
  if (results.length === 0) return { type: "print" }

  switch (action.type) {
    case "print":
      return { type: "print" }

    case "open": {
      return { type: "spawn", cmd: openCommand(results[0]!.path) }
    }

    case "copy": {
      const text = results.map((r) => r.path).join("\n")
      // Prefer OSC 52 (works in most modern terminals, including over SSH)
      return { type: "osc52", text }
    }

    case "navigate": {
      const dir = resolveDir(results[0]!.path)
      return { type: "navigate", dir }
    }

    case "custom": {
      const cmdTemplate = action.customCmd ?? "echo {path}"
      const text = results.map((r) => r.path).join(" ")
      // Replace {path} with space-separated paths; if no {path}, append as last arg
      let cmdStr: string
      if (cmdTemplate.includes("{path}")) {
        cmdStr = cmdTemplate.replace(/{path}/g, text)
      } else {
        cmdStr = `${cmdTemplate} ${text}`
      }
      // Use shell to parse the command string
      if (process.platform === "win32") {
        return { type: "spawn", cmd: ["cmd", "/c", cmdStr] }
      }
      return { type: "spawn", cmd: ["sh", "-c", cmdStr] }
    }

    default:
      return { type: "print" }
  }
}

/* ------------------------------------------------------------------ */
/*  Fallback clipboard (called by startTui if OSC 52 fails)           */
/* ------------------------------------------------------------------ */

export const tryPlatformClipboard = (text: string): boolean => {
  const cmd = clipboardCommand()
  if (!cmd) return false
  try {
    Bun.spawnSync(cmd, { stdin: new TextEncoder().encode(text) })
    return true
  } catch {
    return false
  }
}
