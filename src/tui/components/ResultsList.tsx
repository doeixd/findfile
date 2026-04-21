import { For, Show, createMemo, createSignal } from "solid-js"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing, resolveBorderStyle } from "../theme/tokens.ts"
import type { AppState } from "../state.ts"
import type { SearchResult } from "#core/schema.ts"

const MAX_PREVIEW_LEN = 48
const MAX_PATH_LEN = 28

const truncatePreview = (
  preview: string,
  ranges: ReadonlyArray<readonly [number, number]> | undefined,
): { text: string; shiftedRanges: Array<[number, number]> } => {
  if (preview.length <= MAX_PREVIEW_LEN) {
    return {
      text: preview,
      shiftedRanges: ranges ? ranges.map(([s, e]) => [s, e] as [number, number]) : [],
    }
  }
  if (ranges && ranges.length > 0) {
    const [firstStart] = ranges[0]!
    const half = Math.floor(MAX_PREVIEW_LEN / 2)
    const start = Math.max(0, Math.min(firstStart - half, preview.length - MAX_PREVIEW_LEN))
    const end = Math.min(preview.length, start + MAX_PREVIEW_LEN)
    const shifted = ranges
      .map(([s, e]) => [s - start, e - start] as [number, number])
      .filter(([s, e]) => e > 0 && s < MAX_PREVIEW_LEN)
      .map(([s, e]) => [Math.max(0, s), Math.min(MAX_PREVIEW_LEN, e)] as [number, number])
    return { text: preview.slice(start, end), shiftedRanges: shifted }
  }
  return { text: preview.slice(0, MAX_PREVIEW_LEN), shiftedRanges: [] }
}

const truncatePath = (p: string, max = MAX_PATH_LEN): string =>
  p.length <= max ? p : "…" + p.slice(-(max - 1))

/**
 * Build a single plain-text row string (no highlighting).
 * This avoids any overlap issues from nested spans inside <text>.
 */
const plainRow = (
  r: SearchResult,
  isMarked: boolean,
  isSelected: boolean,
  pathColor: string,
  lineColor: string,
  fgColor: string,
  markedColor: string,
): string => {
  const mark = isMarked ? (isSelected ? "▶ ☑ " : "  ☑ ") : isSelected ? "▶   " : "    "
  if (r.match === undefined) {
    return mark + truncatePath(r.relativePath)
  }
  const path = truncatePath(r.relativePath)
  const line = `:${r.match.line}`
  const preview = r.match.preview.trim().slice(0, MAX_PREVIEW_LEN)
  return mark + path + line + "  " + preview
}

export const ResultsList = (props: { state: AppState; width: `${number}%` | number; showScrollbars: boolean }) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "resultsList", "results", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "resultsList", "results", "fg", "#aaaaaa")
  const fgPath = () => resolveColor(t(), "resultsList", "results", "fgPath", "#64748b")
  const fgLine = () => resolveColor(t(), "resultsList", "results", "fgLine", "#38bdf8")
  const selectedBg = () => resolveColor(t(), "resultsList", "results", "selectedBg", "#334155")
  const selectedFg = () => resolveColor(t(), "resultsList", "results", "selectedFg", "#ffffff")
  const selectedFgPath = () => resolveColor(t(), "resultsList", "results", "selectedFgPath", "#94a3b8")
  const markedFg = () => resolveColor(t(), "resultsList", "results", "markedFg", "#4ade80")
  const markedIndicator = () => resolveColor(t(), "resultsList", "results", "markedIndicator", "#4ade80")
  const border = () => resolveColor(t(), "resultsList", "results", "border", "#334155")
  const titleFg = () => resolveColor(t(), "resultsList", "results", "titleFg", "#94a3b8")
  const padding = () => resolveSpacing(t(), "resultsList", "results", "padding", 1)
  const emptyFg = () => resolveColor(t(), "resultsList", "results", "emptyFg", "#475569")
  const hoverBg = () => resolveColor(t(), "resultsList", "results", "hoverBg", "#1a2235")
  const scrollbarThumb = () => resolveColor(t(), "resultsList", "scrollbar", "thumb", "#2d3142")
  const scrollbarTrack = () => resolveColor(t(), "resultsList", "scrollbar", "track", "transparent")
  const scrollbarWidth = () => resolveSpacing(t(), "resultsList", "scrollbar", "width", 1)

  const [hoveredIdx, setHoveredIdx] = createSignal<number | null>(null)

  let scrollRef: { scrollTo: (y: number) => void } | undefined

  // Scroll selected item into view when selection changes
  const selectedIndex = () => props.state.selected()
  createMemo(() => {
    const idx = selectedIndex()
    if (scrollRef !== undefined) {
      scrollRef.scrollTo(idx)
    }
  })

  const emptyMessage = () => {
    if (props.state.query().length === 0) return "Type to search…"
    if (props.state.status().startsWith("searching")) return "Searching…"
    return "No results"
  }

  const results = () => props.state.results()
  const selected = () => props.state.selected()
  const marks = () => props.state.marks()

  return (
    <box
      borderStyle={resolveBorderStyle(t(), "resultsList", "results", "borderStyle", "single")}
      border
      borderColor={border()}
      title="results"
      width={props.width}
      paddingLeft={padding()}
      paddingRight={padding()}
      flexDirection="column"
      backgroundColor={bg()}
    >
      {/* Always render scrollbox — never swap container type.
          This prevents UI jumping when results appear / disappear. */}
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
        <Show when={results().length === 0}>
          <text fg={emptyFg()}>{emptyMessage()}</text>
        </Show>
        <For each={results()}>
          {(r, i) => {
            const isSel = () => i() === selected()
            const isMarked = () => marks().has(r.path)
            const isHover = () => hoveredIdx() === i()
            const rowBg = () =>
              isSel() ? selectedBg() : isHover() ? hoverBg() : undefined
            return (
              <box
                flexDirection="row"
                width="100%"
                backgroundColor={rowBg()}
                onMouseOver={() => setHoveredIdx(i())}
                onMouseOut={() => setHoveredIdx(null)}
                onMouseDown={() => {
                  const delta = i() - props.state.selected()
                  if (delta !== 0) props.state.moveSelection(delta)
                }}
              >
                <text fg={isSel() ? selectedFg() : fg()}>
                  {plainRow(
                    r,
                    isMarked(),
                    isSel(),
                    isSel() ? selectedFgPath() : fgPath(),
                    fgLine(),
                    fg(),
                    markedIndicator(),
                  )}
                </text>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </box>
  )
}
