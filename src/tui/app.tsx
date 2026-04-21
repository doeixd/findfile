import { useKeyboard } from "@opentui/solid"
import type { KeyEvent } from "@opentui/core"
import { createSignal, Show } from "solid-js"
import { QueryInput } from "./components/QueryInput.tsx"
import { ResultsList } from "./components/ResultsList.tsx"
import { PreviewPane } from "./components/PreviewPane.tsx"
import { StatusBar } from "./components/StatusBar.tsx"
import { HelpOverlay } from "./components/HelpOverlay.tsx"
import { ThemePicker } from "./components/ThemePicker.tsx"
import { Breadcrumbs } from "./components/Breadcrumbs.tsx"
import type { AppState } from "./state.ts"
import type { SearchResult } from "#core/schema.ts"
import { useTheme } from "./theme/syntax.ts"
import { resolveColor } from "./theme/tokens.ts"
import { dispatchKey, defaultKeymap, type KeymapConfig } from "./commands.ts"
import type { CommandContext } from "./commands.ts"
import { themes } from "./theme/presets.ts"

export interface AppLayout {
  readonly weights: readonly [number, number]
  readonly padding: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
}

export interface AppProps {
  state: AppState
  layout: AppLayout
  previewCmd: string | null
  keymap?: Readonly<Record<string, unknown>>
  onExit: () => void
  onSubmit: (results: readonly SearchResult[]) => void
}

const THEME_NAMES = Object.keys(themes).sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }),
)

export const App = (props: AppProps) => {
  const { theme, setTheme } = useTheme()
  const bg = () => resolveColor(theme(), "queryInput", "app", "bg", "#0f172a")
  const [showHelp, setShowHelp] = createSignal(false)
  const [showThemePicker, setShowThemePicker] = createSignal(false)
  const [pickerSelected, setPickerSelected] = createSignal(0)
  const [initialThemeName, setInitialThemeName] = createSignal<string | null>(null)

  const openThemePicker = () => {
    const name = theme().name ?? "dark"
    setInitialThemeName(name)
    const idx = THEME_NAMES.indexOf(name)
    setPickerSelected(idx >= 0 ? idx : 0)
    setShowThemePicker(true)
  }

  const closeThemePicker = (revert = false) => {
    if (revert) {
      const initial = initialThemeName()
      if (initial && themes[initial]) {
        setTheme(themes[initial])
      }
    }
    setInitialThemeName(null)
    setShowThemePicker(false)
  }

  const confirmThemePicker = () => {
    const name = THEME_NAMES[pickerSelected()]
    if (name && themes[name]) {
      setTheme(themes[name])
    }
    setInitialThemeName(null)
    setShowThemePicker(false)
  }

  const movePicker = (delta: number) => {
    const next = Math.max(0, Math.min(THEME_NAMES.length - 1, pickerSelected() + delta))
    setPickerSelected(next)
    const name = THEME_NAMES[next]
    if (name && themes[name]) {
      setTheme(themes[name])
    }
  }

  const context: CommandContext = {
    query: props.state.query,
    setQuery: props.state.setQuery,
    mode: props.state.mode,
    setMode: props.state.setMode,
    results: props.state.results,
    selected: props.state.selected,
    setSelected: props.state.setSelected,
    marks: props.state.marks,
    setMarks: props.state.setMarks,
    preview: props.state.preview,
    cycleMode: props.state.cycleMode,
    cycleModeReverse: props.state.cycleModeReverse,
    moveSelection: props.state.moveSelection,
    toggleMark: props.state.toggleMark,
    markedResults: props.state.markedResults,
    selectedResult: props.state.selectedResult,
    scrollPreview: props.state.scrollPreview,
    onExit: props.onExit,
    onSubmit: props.onSubmit,
    toggleHelp: () => setShowHelp((v) => !v),
    toggleThemePicker: openThemePicker,
    toggleScrollbars: props.state.toggleScrollbars,
    togglePreview: props.state.togglePreview,
    increasePreviewWidth: props.state.increasePreviewWidth,
    decreasePreviewWidth: props.state.decreasePreviewWidth,
    cycleSubmitAction: props.state.cycleSubmitAction,
    toggleBreadcrumbs: props.state.toggleBreadcrumbs,
    toggleStatusBar: props.state.toggleStatusBar,
  }

  /**
   * Keys that should be consumed by the query input rather than
   * dispatched as global commands. This prevents over-listening:
   * typing a space, ?, ctrl+a, etc. won't trigger commands.
   */
  const isInputKey = (e: KeyEvent): boolean => {
    // Printable characters (letters, digits, symbols, space)
    if (e.name.length === 1 && !e.ctrl && !e.option && !e.meta) return true
    // Cursor movement / editing — ONLY when no command modifiers are held
    if (
      ["left", "right", "home", "end", "backspace", "delete"].includes(e.name) &&
      !e.ctrl && !e.option && !e.meta
    )
      return true
    // Standard readline shortcuts — let the input handle them
    if (e.ctrl && ["a", "e", "b", "f", "k", "u", "w", "h", "d"].includes(e.name)) return true
    return false
  }

  useKeyboard((e: KeyEvent) => {
    // Theme picker eats most keys when visible
    if (showThemePicker()) {
      e.preventDefault()
      if (e.name === "up" || (e.ctrl && e.name === "p")) {
        movePicker(-1)
        return
      }
      if (e.name === "down" || (e.ctrl && e.name === "n")) {
        movePicker(1)
        return
      }
      if (e.name === "return" || e.name === "enter") {
        confirmThemePicker()
        return
      }
      if (e.name === "escape") {
        closeThemePicker(true)
        return
      }
      if (e.name === "f1") {
        setShowThemePicker(false)
        setShowHelp(true)
        return
      }
      // Ignore all other keys while picker is open
      return
    }

    // Help overlay eats most keys when visible
    if (showHelp()) {
      e.preventDefault()
      if (e.name === "escape" || e.name === "f1") {
        setShowHelp(false)
        return
      }
      if (e.ctrl && e.name === "t") {
        setShowHelp(false)
        openThemePicker()
        return
      }
      return
    }

    // Query history navigation (when no overlay open)
    if (e.ctrl && e.name === "up") {
      e.preventDefault()
      props.state.cycleQueryHistory(-1)
      return
    }
    if (e.ctrl && e.name === "down") {
      e.preventDefault()
      props.state.cycleQueryHistory(1)
      return
    }

    // If the key belongs to the input, don't dispatch it as a command
    if (isInputKey(e)) return

    const handled = dispatchKey(
      { name: e.name, ctrl: e.ctrl, alt: e.option, meta: e.meta, shift: e.shift },
      { context, keymap: (props.keymap ?? {}) as KeymapConfig, defaultKeymap },
    )
    if (handled) {
      e.preventDefault()
      return
    }
  })

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={bg()}
      paddingTop={props.layout.padding.top}
      paddingRight={props.layout.padding.right}
      paddingBottom={props.layout.padding.bottom}
      paddingLeft={props.layout.padding.left}
    >
      <Show when={!showHelp() && !showThemePicker()}>
        <Breadcrumbs
          cwd={props.state.cwd()}
          onNavigate={(target) => props.state.setCwd(target)}
          visible={props.state.showBreadcrumbs()}
        />
        <QueryInput state={props.state} />
        <box flexDirection="row" flexGrow={1} width="100%">
          <ResultsList
            state={props.state}
            width={props.state.showPreview() ? `${Math.round((1 - props.state.previewWeight()) * 100)}%` : "100%"}
            showScrollbars={props.state.showScrollbars()}
          />
          <Show when={props.state.showPreview()}>
            <PreviewPane
              state={props.state}
              previewCmd={props.previewCmd}
              width={`${Math.round(props.state.previewWeight() * 100)}%`}
            />
          </Show>
        </box>
        <Show when={props.state.showStatusBar()}>
          <StatusBar state={props.state} keymap={props.keymap} />
        </Show>
      </Show>
      <HelpOverlay
        visible={showHelp()}
        keymap={props.keymap}
        onClose={() => setShowHelp(false)}
      />
      <ThemePicker
        visible={showThemePicker()}
        selected={pickerSelected()}
        currentName={theme().name ?? "dark"}
        showScrollbars={props.state.showScrollbars()}
      />
    </box>
  )
}
