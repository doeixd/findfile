import type { Mode, SearchResult } from "#core/schema.ts"
import type { PreviewSlice } from "#core/preview/file.ts"
import type { Accessor, Setter } from "solid-js"

/* ------------------------------------------------------------------ */
/*  Command argument types                                            */
/* ------------------------------------------------------------------ */

export interface MoveCursorArgs {
  /** Direction to move */
  direction: "up" | "down" | "pageup" | "pagedown" | "first" | "last"
  /** Number of rows/pages to move (default: 1) */
  count?: number
}

export interface SetModeArgs {
  mode: Mode
}

export interface ScrollPreviewArgs {
  direction: "up" | "down"
  lines?: number
}

/* ------------------------------------------------------------------ */
/*  Command definitions                                               */
/* ------------------------------------------------------------------ */

export interface CommandRegistry {
  /** Exit the application */
  quit: { args: undefined }
  /** Submit the current selection (or all marked) */
  submit: { args: undefined }
  /** Move cursor in the results list */
  moveCursor: { args: MoveCursorArgs }
  /** Toggle mark on current row */
  toggleMark: { args: undefined }
  /** Mark all visible results */
  markAll: { args: undefined }
  /** Unmark all results */
  unmarkAll: { args: undefined }
  /** Invert all marks */
  invertMarks: { args: undefined }
  /** Cycle to next search mode */
  cycleMode: { args: undefined }
  /** Cycle to previous search mode */
  cycleModeReverse: { args: undefined }
  /** Set a specific search mode */
  setMode: { args: SetModeArgs }
  /** Clear the query input */
  clearQuery: { args: undefined }
  /** Scroll the preview pane */
  scrollPreview: { args: ScrollPreviewArgs }
  /** Toggle help overlay */
  toggleHelp: { args: undefined }
  /** Toggle theme picker overlay */
  toggleThemePicker: { args: undefined }
  /** Toggle scrollbar visibility */
  toggleScrollbars: { args: undefined }
  /** Toggle preview pane visibility */
  togglePreview: { args: undefined }
  /** Increase preview pane width */
  increasePreviewWidth: { args: undefined }
  /** Decrease preview pane width */
  decreasePreviewWidth: { args: undefined }
  /** Cycle to next submit action (what Enter does) */
  cycleSubmitAction: { args: undefined }
  /** Toggle breadcrumbs path bar */
  toggleBreadcrumbs: { args: undefined }
  /** Toggle status bar */
  toggleStatusBar: { args: undefined }
}

export type CommandName = keyof CommandRegistry

export type CommandBinding =
  | CommandName
  | { command: CommandName; args?: Record<string, unknown> }
  | Array<CommandName | { command: CommandName; args?: Record<string, unknown> }>

export type KeymapConfig = Record<string, CommandBinding>

/* ------------------------------------------------------------------ */
/*  Runtime command context — everything a command can access         */
/* ------------------------------------------------------------------ */

export interface CommandContext {
  readonly query: Accessor<string>
  readonly setQuery: Setter<string>
  readonly mode: Accessor<Mode>
  readonly setMode: Setter<Mode>
  readonly results: Accessor<readonly SearchResult[]>
  readonly selected: Accessor<number>
  readonly setSelected: Setter<number>
  readonly marks: Accessor<ReadonlySet<string>>
  readonly setMarks: Setter<ReadonlySet<string>>
  readonly preview: Accessor<PreviewSlice | null>
  readonly cycleMode: () => void
  readonly cycleModeReverse: () => void
  readonly moveSelection: (delta: number) => void
  readonly toggleMark: () => void
  readonly markedResults: Accessor<readonly SearchResult[]>
  readonly selectedResult: Accessor<SearchResult | null>
  readonly scrollPreview: (delta: number) => void
  readonly onExit: () => void
  readonly onSubmit: (results: readonly SearchResult[]) => void
  readonly toggleHelp?: () => void
  readonly toggleThemePicker?: () => void
  readonly toggleScrollbars?: () => void
  readonly togglePreview?: () => void
  readonly increasePreviewWidth?: () => void
  readonly decreasePreviewWidth?: () => void
  readonly cycleSubmitAction?: () => void
  readonly toggleBreadcrumbs?: () => void
  readonly toggleStatusBar?: () => void
}

/* ------------------------------------------------------------------ */
/*  Command handlers                                                  */
/* ------------------------------------------------------------------ */

const DELTA_MAP: Record<MoveCursorArgs["direction"], number> = {
  up: -1,
  down: 1,
  pageup: -10,
  pagedown: 10,
  first: Number.NEGATIVE_INFINITY,
  last: Number.POSITIVE_INFINITY,
}

export const commandHandlers: {
  [K in CommandName]: (ctx: CommandContext, args: CommandRegistry[K]["args"]) => void
} = {
  quit: (ctx) => ctx.onExit(),

  submit: (ctx) => {
    const marked = ctx.markedResults()
    if (marked.length > 0) {
      ctx.onSubmit(marked)
    } else {
      const r = ctx.selectedResult()
      if (r !== null) ctx.onSubmit([r])
    }
  },

  moveCursor: (ctx, args) => {
    const count = args.count ?? 1
    const delta = DELTA_MAP[args.direction] * count
    ctx.moveSelection(delta)
  },

  toggleMark: (ctx) => ctx.toggleMark(),

  markAll: (ctx) => {
    const allPaths = ctx.results().map((r) => r.path)
    ctx.setMarks(new Set(allPaths))
  },

  unmarkAll: (ctx) => ctx.setMarks(new Set()),

  invertMarks: (ctx) => {
    const current = ctx.marks()
    const allPaths = ctx.results().map((r) => r.path)
    const next = new Set<string>()
    for (const path of allPaths) {
      if (!current.has(path)) next.add(path)
    }
    ctx.setMarks(next)
  },

  cycleMode: (ctx) => ctx.cycleMode(),

  cycleModeReverse: (ctx) => ctx.cycleModeReverse(),

  setMode: (ctx, args) => {
    ctx.setMode(args.mode)
  },

  clearQuery: (ctx) => ctx.setQuery(""),

  scrollPreview: (ctx, args) => {
    const delta = args.direction === "up" ? -(args.lines ?? 3) : (args.lines ?? 3)
    ctx.scrollPreview(delta)
  },

  toggleHelp: (ctx) => ctx.toggleHelp?.(),

  toggleThemePicker: (ctx) => ctx.toggleThemePicker?.(),

  toggleScrollbars: (ctx) => ctx.toggleScrollbars?.(),

  togglePreview: (ctx) => ctx.togglePreview?.(),

  increasePreviewWidth: (ctx) => ctx.increasePreviewWidth?.(),

  decreasePreviewWidth: (ctx) => ctx.decreasePreviewWidth?.(),

  cycleSubmitAction: (ctx) => ctx.cycleSubmitAction?.(),

  toggleBreadcrumbs: (ctx) => ctx.toggleBreadcrumbs?.(),

  toggleStatusBar: (ctx) => ctx.toggleStatusBar?.(),
}

/* ------------------------------------------------------------------ */
/*  Dispatcher                                                        */
/* ------------------------------------------------------------------ */

const normalizeBinding = (
  binding: CommandBinding,
): Array<{ command: CommandName; args?: Record<string, unknown> }> => {
  if (typeof binding === "string") return [{ command: binding }]
  if (Array.isArray(binding)) {
    return binding.map((b) =>
      typeof b === "string" ? { command: b } : b,
    )
  }
  return [{ command: binding.command, args: binding.args }]
}

const MODIFIER_WORDS = new Set([
  "ctrl", "alt", "meta", "cmd", "command", "win", "option", "shift",
])

/** Parses a key chord string into a matcher predicate.
 *  Supports `ctrl+c`, `alt+shift+f`, `pageup`, `ctrl+-`, etc.
 */
export const parseKeyChord = (chord: string): ((e: { name: string; ctrl: boolean; alt: boolean; meta: boolean; shift: boolean }) => boolean) => {
  // Handle literal "-" key by preserving trailing "-" after split
  const endsWithDash = chord.endsWith("-")
  const parts = chord.toLowerCase().split(/[-+]/)
  if (endsWithDash) parts.push("-")

  const modifiers = {
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt") || parts.includes("option"),
    meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("command") || parts.includes("win"),
    shift: parts.includes("shift"),
  }
  const keyPart = parts
    .filter((p) => !MODIFIER_WORDS.has(p))
    .join("-")

  return (e) => {
    const nameMatch = e.name.toLowerCase() === keyPart || e.name === keyPart
    const ctrlMatch = e.ctrl === modifiers.ctrl
    // OpenTUI conflates alt and meta in terminal escape sequences:
    // alt+o often parses as meta=true instead of option=true.
    // Treat alt/meta as interchangeable for matching.
    const altOrMeta = e.alt || e.meta
    const wantsAltOrMeta = modifiers.alt || modifiers.meta
    const altMetaMatch = wantsAltOrMeta === altOrMeta
    const shiftMatch = e.shift === modifiers.shift
    return nameMatch && ctrlMatch && altMetaMatch && shiftMatch
  }
}

export interface DispatchOptions {
  readonly context: CommandContext
  readonly keymap: KeymapConfig
  readonly defaultKeymap: KeymapConfig
}

export const dispatchKey = (e: {
  name: string
  ctrl: boolean
  alt: boolean
  meta: boolean
  shift: boolean
}, opts: DispatchOptions): boolean => {
  // Search user keymap first, then defaults
  const maps = [opts.keymap, opts.defaultKeymap]

  for (const map of maps) {
    for (const [chord, binding] of Object.entries(map)) {
      const matcher = parseKeyChord(chord)
      if (matcher(e)) {
        const commands = normalizeBinding(binding)
        for (const cmd of commands) {
          const handler = commandHandlers[cmd.command]
          if (handler) {
            handler(opts.context, cmd.args as never)
          }
        }
        return true
      }
    }
  }

  return false
}

/* ------------------------------------------------------------------ */
/*  Default keymap                                                    */
/* ------------------------------------------------------------------ */

export const defaultKeymap: KeymapConfig = {
  escape: "quit",
  "ctrl+c": "quit",

  down: { command: "moveCursor", args: { direction: "down" } },
  up: { command: "moveCursor", args: { direction: "up" } },
  "ctrl+n": { command: "moveCursor", args: { direction: "down" } },
  "ctrl+p": { command: "moveCursor", args: { direction: "up" } },
  pagedown: { command: "moveCursor", args: { direction: "pagedown" } },
  pageup: { command: "moveCursor", args: { direction: "pageup" } },
  home: { command: "moveCursor", args: { direction: "first" } },
  end: { command: "moveCursor", args: { direction: "last" } },

  tab: "cycleMode",
  "shift+tab": "cycleModeReverse",

  "ctrl+space": "toggleMark",
  "ctrl+shift+a": "markAll",
  "ctrl+shift+u": "unmarkAll",
  "ctrl+shift+i": "invertMarks",

  return: "submit",
  enter: "submit",
  "\r": "submit",

  "ctrl+l": "clearQuery",
  f1: "toggleHelp",
  "ctrl+t": "toggleThemePicker",
  "alt+s": "toggleScrollbars",
  f2: "togglePreview",
  f3: "increasePreviewWidth",
  f4: "decreasePreviewWidth",
  "ctrl+shift+right": "increasePreviewWidth",
  "ctrl+shift+left": "decreasePreviewWidth",
  "ctrl+shift+b": "increasePreviewWidth",
  "ctrl+shift+s": "decreasePreviewWidth",
  "alt+o": "cycleSubmitAction",
  "meta+o": "cycleSubmitAction",
  "alt+p": "toggleBreadcrumbs",
  "alt+b": "toggleStatusBar",
  "alt+d": { command: "scrollPreview", args: { direction: "down", lines: 5 } },
  "alt+u": { command: "scrollPreview", args: { direction: "up", lines: 5 } },
}
