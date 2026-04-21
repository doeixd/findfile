import { onMount } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing, resolveBorderStyle } from "../theme/tokens.ts"
import type { AppState } from "../state.ts"
import { getActionLabel } from "../submit-action.ts"

export const QueryInput = (props: { state: AppState }) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "queryInput", "input", "bg", "#1e293b")
  const fg = () => resolveColor(t(), "queryInput", "input", "fg", "#e2e8f0")
  const placeholderFg = () => resolveColor(t(), "queryInput", "input", "placeholderFg", "#475569")
  const border = () => resolveColor(t(), "queryInput", "input", "border", "#334155")
  const borderFocused = () => resolveColor(t(), "queryInput", "input", "borderFocused", "#38bdf8")
  const padding = () => resolveSpacing(t(), "queryInput", "input", "padding", 1)
  const height = () => resolveSpacing(t(), "queryInput", "input", "height", 3)
  const accent = () => resolveColor(t(), "queryInput", "input", "borderFocused", "#38bdf8")

  let inputRef: InputRenderable | undefined

  onMount(() => {
    inputRef?.focus()
  })

  return (
    <box
      borderStyle={resolveBorderStyle(t(), "queryInput", "input", "borderStyle", "single")}
      border
      borderColor={border()}
      focusedBorderColor={borderFocused()}
      backgroundColor={bg()}
      height={height()}
      paddingLeft={padding()}
      paddingRight={padding()}
      flexDirection="row"
      alignItems="center"
    >
      <text fg={accent()} marginRight={1}>
        {props.state.mode().charAt(0).toUpperCase() + props.state.mode().slice(1)}
      </text>
      <text fg={accent()} marginRight={1}>
        [{getActionLabel(props.state.submitAction())}]
      </text>
      <input
        ref={(r) => { inputRef = r }}
        flexGrow={1}
        placeholder="search…"
        placeholderColor={placeholderFg()}
        textColor={fg()}
        backgroundColor={bg()}
        focusedBackgroundColor={bg()}
        cursorColor={accent()}
        value={props.state.query()}
        onInput={(v) => props.state.setQuery(v)}
      />
    </box>
  )
}
