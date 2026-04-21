import { Show } from "solid-js"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing, resolveBorderStyle } from "../theme/tokens.ts"
import { defaultKeymap, type KeymapConfig } from "../commands.ts"

const formatChord = (chord: string): string =>
  chord
    .replace(/^return$/, "Enter")
    .replace(/^escape$/, "Esc")
    .replace(/^space$/, "Space")
    .replace(/^tab$/, "Tab")

const HARDCODED_BINDINGS: Record<string, string> = {
  cycleQueryHistory: "ctrl+up / ctrl+down",
}

const collectBindings = (
  userKeymap: KeymapConfig | undefined,
): Map<string, string> => {
  const out = new Map<string, string>()
  // Hardcoded bindings first
  for (const [cmd, chord] of Object.entries(HARDCODED_BINDINGS)) {
    out.set(cmd, chord)
  }
  const maps = [defaultKeymap, userKeymap]
  for (const map of maps) {
    if (!map) continue
    for (const [chord, binding] of Object.entries(map)) {
      const cmds = Array.isArray(binding) ? binding : [binding]
      for (const c of cmds) {
        const cmd = typeof c === "string" ? c : c.command
        if (!out.has(cmd)) out.set(cmd, formatChord(chord))
      }
    }
  }
  return out
}

const CATEGORIES: Array<{ title: string; commands: string[] }> = [
  {
    title: "Navigation",
    commands: [
      "moveCursor",
      "cycleMode",
      "cycleModeReverse",
      "setMode",
      "scrollPreview",
    ],
  },
  {
    title: "Selection",
    commands: [
      "toggleMark",
      "markAll",
      "unmarkAll",
      "invertMarks",
      "submit",
    ],
  },
  {
    title: "Query",
    commands: ["clearQuery", "cycleQueryHistory"],
  },
  {
    title: "App",
    commands: ["toggleHelp", "toggleThemePicker", "toggleScrollbars", "togglePreview", "toggleBreadcrumbs", "increasePreviewWidth", "decreasePreviewWidth", "cycleSubmitAction", "quit"],
  },
]

const COMMAND_LABELS: Record<string, string> = {
  moveCursor: "Move cursor",
  cycleMode: "Next mode",
  cycleModeReverse: "Previous mode",
  setMode: "Set mode",
  scrollPreview: "Scroll preview",
  toggleMark: "Toggle mark",
  markAll: "Mark all",
  unmarkAll: "Unmark all",
  invertMarks: "Invert marks",
  submit: "Open selection",
  clearQuery: "Clear query",
  cycleQueryHistory: "Query history",
  toggleHelp: "Toggle help",
  toggleThemePicker: "Toggle theme picker",
  toggleScrollbars: "Toggle scrollbars",
  togglePreview: "Toggle preview pane",
  toggleBreadcrumbs: "Toggle breadcrumbs",
  increasePreviewWidth: "Wider preview",
  decreasePreviewWidth: "Narrower preview",
  cycleSubmitAction: "Cycle submit action",
  quit: "Quit",
}

export const HelpOverlay = (props: {
  visible: boolean
  keymap?: Readonly<Record<string, unknown>>
  onClose: () => void
}) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "previewPane", "preview", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "previewPane", "preview", "fg", "#e2e8f0")
  const border = () => resolveColor(t(), "previewPane", "preview", "border", "#334155")
  const titleFg = () => resolveColor(t(), "previewPane", "preview", "titleFg", "#94a3b8")
  const accent = () => resolveColor(t(), "queryInput", "input", "borderFocused", "#38bdf8")
  const dim = () => resolveColor(t(), "previewPane", "preview", "emptyFg", "#777777")

  const bindings = () => collectBindings(props.keymap as KeymapConfig | undefined)

  return (
    <Show when={props.visible}>
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        backgroundColor={bg()}
        borderStyle={resolveBorderStyle(t(), "previewPane", "preview", "borderStyle", "single")}
        border
        borderColor={border()}
        title=" help (esc or f1 to close) "
        titleAlignment="center"
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        {CATEGORIES.map((cat) => (
          <box flexDirection="column" marginBottom={1}>
            <text fg={accent()}>{cat.title}</text>
            {cat.commands.map((cmd) => {
              const key = bindings().get(cmd)
              return (
                <box flexDirection="row" gap={2}>
                  <text fg={dim()} width={12}>
                    {key ?? "—"}
                  </text>
                  <text fg={fg()}>{COMMAND_LABELS[cmd] ?? cmd}</text>
                </box>
              )
            })}
          </box>
        ))}
        <text fg={dim()}> </text>
        <text fg={dim()}>Press Esc or F1 to close this overlay.</text>
      </box>
    </Show>
  )
}
