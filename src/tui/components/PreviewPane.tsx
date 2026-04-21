import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import type { AppState } from "../state.ts"
import type { PreviewSlice } from "#core/preview/file.ts"
import { useTheme } from "../theme/syntax.ts"
import { resolveColor, resolveSpacing, resolveBorderStyle } from "../theme/tokens.ts"
import { createSyntaxStyle } from "../theme/syntax.ts"

const SHELL = process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"]

const runPreviewCmdAsync = (
  cmd: string,
  filePath: string,
  line: number | null,
): Promise<string> => {
  const substituted = cmd
    .replace(/\{line\}/g, line !== null ? String(line) : "")
    .replace(/\{\}/g, filePath)
  return new Promise((resolve) => {
    try {
      const proc = Bun.spawn([...SHELL, substituted], {
        stdout: "pipe",
        stderr: "pipe",
      })
      proc.exited.then(
        (code) => {
          if (code !== 0) {
            resolve(
              `preview error (${code}): ${proc.stderr.toString().trim() || "command failed"}`,
            )
          } else {
            resolve(proc.stdout.toString())
          }
        },
        (e) => resolve(`preview error: ${String(e)}`),
      )
    } catch (e) {
      resolve(`preview error: ${String(e)}`)
    }
  })
}

export const PreviewPane = (props: {
  state: AppState
  width: `${number}%` | number
  previewCmd: string | null
}) => {
  const { theme } = useTheme()
  const t = () => theme()

  const bg = () => resolveColor(t(), "previewPane", "preview", "bg", "#0f172a")
  const fg = () => resolveColor(t(), "previewPane", "preview", "fg", "#e2e8f0")
  const fgPath = () => resolveColor(t(), "previewPane", "preview", "fgPath", "#94a3b8")
  const border = () => resolveColor(t(), "previewPane", "preview", "border", "#334155")
  const titleFg = () => resolveColor(t(), "previewPane", "preview", "titleFg", "#94a3b8")
  const padding = () => resolveSpacing(t(), "previewPane", "preview", "padding", 1)
  const errorFg = () => resolveColor(t(), "previewPane", "preview", "errorFg", "#ef4444")
  const emptyFg = () => resolveColor(t(), "previewPane", "preview", "emptyFg", "#777777")

  const [previewCmdOutput, setPreviewCmdOutput] = createSignal<string | null>(null)
  const [previewCmdLoading, setPreviewCmdLoading] = createSignal(false)

  createEffect(() => {
    const cmd = props.previewCmd
    const r = props.state.selectedResult()
    if (cmd === null || r === null) {
      setPreviewCmdOutput(null)
      setPreviewCmdLoading(false)
      return
    }
    setPreviewCmdLoading(true)
    setPreviewCmdOutput(null)
    let cancelled = false
    runPreviewCmdAsync(cmd, r.path, r.match?.line ?? null).then((text) => {
      if (!cancelled) {
        setPreviewCmdOutput(text)
        setPreviewCmdLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  })

  const syntaxStyle = createMemo(() => createSyntaxStyle(t()))

  return (
    <box
      borderStyle={resolveBorderStyle(t(), "previewPane", "preview", "borderStyle", "single")}
      border
      borderColor={border()}
      title={props.previewCmd !== null ? "preview (custom)" : "preview"}
      width={props.width}
      paddingLeft={padding()}
      paddingRight={padding()}
      flexDirection="column"
      backgroundColor={bg()}
    >
      {/* Header line — always rendered so the pane doesn't jump
          when switching between empty / selected states. */}
      <text fg={fgPath()} height={1}>
        {(() => {
          const r = props.state.selectedResult()
          if (r === null) return "(no selection)"
          const s = props.state.preview()
          if (s?.isDirectory) return `${s.path}  (directory)`
          if (s?.isBinary) return `${s.path}  (binary)`
          return r.relativePath
        })()}
      </text>

      <box flexGrow={1} flexDirection="column" width="100%">
        <Show when={props.previewCmd !== null}>
          <Show when={!previewCmdLoading()} fallback={<text fg={emptyFg()}>loading…</text>}>
            <text fg={fg()}>{previewCmdOutput() ?? "(no output)"}</text>
          </Show>
        </Show>
        <Show when={props.previewCmd === null}>
          <Show
            when={props.state.previewError()}
            fallback={
              <Show
                when={props.state.preview()}
                fallback={<text fg={emptyFg()}>(select a result)</text>}
              >
                {(slice: () => PreviewSlice) => (
                  <Show
                    when={!slice().isDirectory && !slice().isBinary}
                    fallback={<text fg={fg()}>{slice().text}</text>}
                  >
                    <PreviewLines
                      slice={slice()}
                      scroll={props.state.previewScroll()}
                      syntaxStyle={syntaxStyle()}
                      fg={fg()}
                      lineNumFg={fgPath()}
                    />
                  </Show>
                )}
              </Show>
            }
          >
            {(err: () => string) => <text fg={errorFg()}>error: {err()}</text>}
          </Show>
        </Show>
      </box>
    </box>
  )
}

const MAX_LINE_LEN = 240

const truncateLine = (s: string, max = MAX_LINE_LEN): string =>
  s.length <= max ? s : s.slice(0, max - 1) + "…"

const PreviewLines = (props: {
  slice: PreviewSlice
  scroll: number
  syntaxStyle: ReturnType<typeof createSyntaxStyle>
  fg: string
  lineNumFg: string
}) => {
  const lines = createMemo(() => props.slice.text.split("\n"))
  const visible = createMemo(() => {
    const all = lines()
    const start = Math.min(props.scroll, Math.max(0, all.length - 1))
    return all.slice(start).map((text, i) => ({
      lineNum: props.slice.startLine + start + i,
      text: truncateLine(text),
    }))
  })

  return (
    <box flexDirection="column" width="100%">
      <For each={visible()}>
        {(line) => (
          <box flexDirection="row">
            <text fg={props.lineNumFg}>
              {String(line.lineNum).padStart(4, " ")} │{" "}
            </text>
            <text fg={props.fg}>{line.text}</text>
          </box>
        )}
      </For>
    </box>
  )
}
