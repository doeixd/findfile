import { For, Show } from "solid-js"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing } from "../theme/tokens.ts"


interface BreadcrumbsProps {
  cwd: string
  onNavigate: (target: string) => void
  visible: boolean
  editing: boolean
  setEditing: (v: boolean) => void
  editValue: string
  setEditValue: (v: string) => void
}

export const Breadcrumbs = (props: BreadcrumbsProps) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "app", "app", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "results", "results", "fgPath", "#64748b")
  const fgHover = () => resolveColor(t(), "results", "results", "fgLine", "#38bdf8")
  const padding = () => resolveSpacing(t(), "queryInput", "input", "padding", 1)
  const height = () => resolveSpacing(t(), "queryInput", "input", "height", 1)

  const segments = () => {
    const cwd = props.cwd
    if (!cwd || cwd === "/" || cwd === ".") return [{ label: cwd || ".", target: cwd || "." }]
    const parts = cwd.split(/[/\\]/).filter((p) => p.length > 0)
    if (parts.length === 0) return [{ label: cwd, target: cwd }]
    // On Windows, first part might be a drive letter like "C:"
    const isWin = process.platform === "win32"
    let prefix = ""
    const out: Array<{ label: string; target: string }> = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      if (i === 0 && isWin && part.endsWith(":")) {
        prefix = part + "/"
        out.push({ label: part, target: prefix })
        continue
      }
      prefix = prefix + part + "/"
      out.push({ label: part, target: prefix.slice(0, -1) })
    }
    return out
  }

  const startEdit = () => {
    props.setEditValue(props.cwd)
    props.setEditing(true)
  }

  return (
    <Show when={props.visible}>
      <box
        backgroundColor={bg()}
        height={height()}
        paddingLeft={padding()}
        paddingRight={padding()}
        flexDirection="row"
        alignItems="center"
        width="100%"
      >
        <Show
          when={props.editing}
          fallback={
            <>
              <For each={segments()}>
                {(seg, i) => (
                  <>
                    <Show when={i() > 0}>
                      <text fg={fg()} dimColor> / </text>
                    </Show>
                    <text
                      fg={fg()}
                      dimColor
                      onMouseDown={() => props.onNavigate(seg.target)}
                    >
                      {seg.label}
                    </text>
                  </>
                )}
              </For>
              <box flexGrow={1} />
              <text
                fg={fg()}
                dimColor
                onMouseDown={startEdit}
              >
                [edit]
              </text>
            </>
          }
        >
          <input
            flexGrow={1}
            textColor={fgHover()}
            backgroundColor={bg()}
            focusedBackgroundColor={bg()}
            cursorColor={fgHover()}
            value={props.editValue}
            onInput={(v) => props.setEditValue(v)}
          />
        </Show>
      </box>
    </Show>
  )
}
