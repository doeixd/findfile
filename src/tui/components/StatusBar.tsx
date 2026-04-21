import { Show, createSignal, onCleanup, onMount } from "solid-js"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing } from "../theme/tokens.ts"
import type { AppState } from "../state.ts"
import type { KeymapConfig } from "../commands.ts"
import { defaultKeymap } from "../commands.ts"
import { isFirstRun, markFirstRun } from "../first-run.ts"


/**
 * Spinner frames from opencode's CLI (charmbracelet/bubbles spinner.Dot).
 * Braille patterns with trailing space for consistent width.
 */
const SPINNER_FRAMES = ["⣾ ", "⣽ ", "⣻ ", "⢿ ", "⡿ ", "⣟ ", "⣯ ", "⣷ "] as const

/** Extracts the first key chord that binds a given command */
const findKeyForCommand = (
  command: string,
  userKeymap: Readonly<Record<string, unknown>> | undefined,
): string | null => {
  const maps = [userKeymap, defaultKeymap]
  for (const map of maps) {
    if (!map) continue
    for (const [chord, binding] of Object.entries(map)) {
      const bindings = Array.isArray(binding) ? binding : [binding]
      for (const b of bindings) {
        const cmd = typeof b === "string" ? b : (b as { command?: string }).command
        if (cmd === command) return chord
      }
    }
  }
  return null
}

const formatChord = (chord: string): string => {
  return chord
    .replace(/ctrl\+/g, "C-")
    .replace(/alt\+/g, "M-")
    .replace(/shift\+/g, "S-")
    .replace(/meta\+/g, "Cmd-")
    .replace(/^return$/, "Enter")
    .replace(/^escape$/, "Esc")
    .replace(/^space$/, "Spc")
    .replace(/^pagedown$/, "PgDn")
    .replace(/^pageup$/, "PgUp")
}

export const StatusBar = (props: { state: AppState; keymap?: Readonly<Record<string, unknown>> }) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "statusBar", "status", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "statusBar", "status", "fg", "#aaaaaa")
  const fgMode = () => resolveColor(t(), "statusBar", "status", "fgMode", "#38bdf8")
  const fgKey = () => resolveColor(t(), "statusBar", "status", "fgKey", "#666666")
  const height = () => resolveSpacing(t(), "statusBar", "status", "height", 1)
  const warningFg = () => resolveColor(t(), "statusBar", "status", "warningFg", "#fbbf24")

  const key = (cmd: string) => {
    const chord = findKeyForCommand(cmd, props.keymap)
    return chord ? formatChord(chord) : null
  }

  const [showWelcome, setShowWelcome] = createSignal(false)
  const [spinnerFrame, setSpinnerFrame] = createSignal(0)

  onMount(() => {
    if (isFirstRun()) {
      setShowWelcome(true)
      markFirstRun()
      setTimeout(() => setShowWelcome(false), 8000)
    }

    const id = setInterval(() => {
      setSpinnerFrame((i) => (i + 1) % SPINNER_FRAMES.length)
    }, 100)
    onCleanup(() => clearInterval(id))
  })

  const hints = [
    key("cycleMode") && `${key("cycleMode")}:mode`,
    key("moveCursor") && `${key("moveCursor")}:sel`,
    key("toggleMark") && `${key("toggleMark")}:mark`,
    key("submit") && `${key("submit")}:open`,
    key("quit") && `${key("quit")}:quit`,
    key("toggleHelp") && `${key("toggleHelp")}:help`,
    key("toggleScrollbars") && `${key("toggleScrollbars")}:scroll`,
    key("togglePreview") && `${key("togglePreview")}:prev`,
    key("toggleBreadcrumbs") && `${key("toggleBreadcrumbs")}:path`,
    key("cycleSubmitAction") && `${key("cycleSubmitAction")}:act`,
  ].filter(Boolean)

  const scan = () => props.state.scanProgress()
  const scanningText = () => {
    const s = scan()
    if (!s.isScanning && s.isWarmupComplete) return null
    const frame = SPINNER_FRAMES[spinnerFrame()]
    if (s.isScanning) {
      return `${frame} indexing ${s.scannedFilesCount} files`
    }
    return `${frame} indexing…`
  }

  return (
    <box
      height={height()}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      backgroundColor={bg()}
    >
      <text fg={fgMode()}>{props.state.mode().charAt(0).toUpperCase() + props.state.mode().slice(1)}</text>
      <Show when={scanningText()}>
        <text fg={warningFg()}> {scanningText()}</text>
      </Show>
      <Show when={showWelcome()}>
        <text fg={warningFg()}>  Welcome! Type to search · Tab for modes · ? for help</text>
      </Show>
      <Show when={!showWelcome()}>
        <text fg={fgKey()}>  {hints.join(" · ")}</text>
      </Show>
    </box>
  )
}
