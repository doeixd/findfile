import { For, Show, createEffect } from "solid-js"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveBorderStyle, resolveSpacing } from "../theme/tokens.ts"
import { themes } from "../theme/presets.ts"

const THEME_NAMES = Object.keys(themes).sort((a, b) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }),
)

export const ThemePicker = (props: {
  visible: boolean
  selected: number
  currentName: string
  showScrollbars: boolean
}) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "previewPane", "preview", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "previewPane", "preview", "fg", "#e2e8f0")
  const border = () => resolveColor(t(), "previewPane", "preview", "border", "#334155")
  const accent = () => resolveColor(t(), "queryInput", "input", "borderFocused", "#38bdf8")
  const dim = () => resolveColor(t(), "previewPane", "preview", "emptyFg", "#777777")
  const surface = () => resolveColor(t(), "resultsList", "results", "selectedBg", "#334155")
  const scrollbarThumb = () => resolveColor(t(), "previewPane", "scrollbar", "thumb", "#2d3142")
  const scrollbarTrack = () => resolveColor(t(), "previewPane", "scrollbar", "track", "transparent")

  let scrollRef: { scrollTo: (y: number) => void } | undefined

  createEffect(() => {
    const idx = props.selected
    if (scrollRef !== undefined) {
      scrollRef.scrollTo(idx)
    }
  })

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
        title=" themes (enter=select, esc=cancel) "
        titleAlignment="center"
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
        paddingBottom={1}
      >
        <scrollbox
          flexGrow={1}
          scrollX={false}
          scrollbarOptions={{
            trackOptions: {
              backgroundColor: props.showScrollbars ? scrollbarTrack() : "transparent",
              foregroundColor: props.showScrollbars ? scrollbarThumb() : "transparent",
            },
          }}
          horizontalScrollbarOptions={{
            trackOptions: {
              height: 1,
              backgroundColor: "transparent",
              foregroundColor: "transparent",
            },
          }}
          ref={(r: { scrollTo: (y: number) => void }) => { scrollRef = r }}
        >
          <For each={THEME_NAMES}>
            {(name, index) => {
              const isActive = () => index() === props.selected
              const isCurrent = () => name === props.currentName
              return (
                <box
                  flexDirection="row"
                  gap={1}
                  height={1}
                  backgroundColor={isActive() ? surface() : undefined}
                >
                  <text fg={isCurrent() ? accent() : dim()} width={2}>
                    {isCurrent() ? "●" : " "}
                  </text>
                  <text
                    fg={isActive() ? fg() : dim()}
                    attributes={isActive() ? 1 : 0}
                  >
                    {name}
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>
        <text fg={dim()}>
          ↑↓ to preview · Enter to confirm · Esc to cancel
        </text>
      </box>
    </Show>
  )
}
