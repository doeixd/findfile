import { Effect, Runtime } from "effect"
import { render } from "@opentui/solid"
import { createCliRenderer } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { createSignal } from "solid-js"
import { App } from "./app.tsx"
import { createAppState } from "./state.ts"
import { QueryRouter } from "#core/query/router.ts"
import { PreviewService } from "#core/preview/file.ts"
import { FffFinder } from "#core/backends/fff-finder.ts"
import { formatResult } from "#core/format.ts"
import type { Format } from "#core/format.ts"
import type { Mode, ModeDefaults, SearchPath, SearchResult } from "#core/schema.ts"
import type { FindfileTheme } from "./theme/tokens.ts"
import { defaultTheme } from "./theme/presets.ts"
import { mergeTheme } from "./theme/tokens.ts"
import { ThemeContext } from "./theme/syntax.ts"
import type { KeymapConfig } from "./commands.ts"
import { getSubmitOutcome, tryPlatformClipboard } from "./submit-action.ts"
import type { SubmitAction } from "./submit-action.ts"

export interface TuiOptions {
  readonly cwd: SearchPath
  readonly initialMode: Mode
  readonly initialQuery: string
  readonly limit: number
  readonly weights: readonly [number, number]
  readonly format: Format
  readonly previewCmd: string | null
  readonly useColor: boolean
  readonly theme: FindfileTheme | null
  readonly keymap: Readonly<Record<string, unknown>> | null
  readonly modeDefaults: Readonly<Record<string, ModeDefaults>>
  readonly submitAction: SubmitAction
  readonly openCmd: string | null
  readonly padding: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number }
  readonly layoutPrefs: { readonly previewWeight: number; readonly showPreview: boolean; readonly showBreadcrumbs: boolean; readonly showStatusBar: boolean; readonly showScrollbars: boolean }
}

/**
 * Launches the Solid TUI. Returns an Effect that resolves when the user
 * exits (esc / ctrl+c). On exit with a selection the UI prints results
 * to stdout respecting `--format` so shell wrappers can open the file(s).
 */
export const startTui = (opts: TuiOptions) =>
  Effect.gen(function* () {
    const router = yield* QueryRouter
    const preview = yield* PreviewService
    const finder = yield* FffFinder
    const runtime = yield* Effect.runtime<never>()

    // Pre-create the finder so the background scan starts before the TUI
    // opens. Without this, the first search hits a cold index and returns
    // empty results, while pollScan reports "indexing forever".
    yield* finder.get(opts.cwd).pipe(
      Effect.catchAll(() => Effect.succeed(undefined)),
    )

    const state = createAppState({
      router,
      preview,
      finder,
      cwd: opts.cwd,
      initialMode: opts.initialMode,
      limit: opts.limit,
      runtime,
      modeDefaults: opts.modeDefaults,
      layout: opts.layoutPrefs,
    })

    if (opts.initialQuery.length > 0) {
      state.setQuery(opts.initialQuery)
    }
    state.setSubmitAction(opts.submitAction)

    let resolveExit: () => void = () => {}
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })

    const submitted: { current: readonly SearchResult[] | null } = { current: null }

    const [theme, setTheme] = createSignal(
      opts.theme ? mergeTheme(defaultTheme, opts.theme) : defaultTheme,
    )

    // Create renderer manually so we can switch back to main-screen
    // before printing results. Otherwise alternate-screen discards stdout.
    const renderer: CliRenderer = yield* Effect.tryPromise({
      try: () => createCliRenderer({ screenMode: "alternate-screen", clearOnShutdown: true }),
      catch: (e) => new Error(`Failed to create renderer: ${String(e)}`),
    })

    const doExit = (withResults: boolean) => {
      // Stop rendering first so we don't fight the screen-mode switch
      renderer.stop()
      // Switch back to main-screen so printed output survives process exit
      renderer.screenMode = "main-screen"
      // Clean up all pending timers, fibers, and resources
      state.cleanup()
      resolveExit()
    }

    yield* Effect.tryPromise({
      try: () =>
        render(
          () => (
            <ThemeContext.Provider value={{ theme, setTheme }}>
              <App
                state={state}
                layout={{ weights: opts.weights, padding: opts.padding }}
                previewCmd={opts.previewCmd}
                keymap={opts.keymap ?? undefined}
                onExit={() => {
                  doExit(false)
                }}
                onSubmit={(results) => {
                  submitted.current = results
                  const queryText = state.query()
                  for (const r of results) {
                    Runtime.runFork(runtime)(
                      finder.trackQuery(opts.cwd, queryText, r.path),
                    )
                  }
                  doExit(true)
                }}
              />
            </ThemeContext.Provider>
          ),
          renderer,
        ),
      catch: (e) => new Error(`TUI render failed: ${String(e)}`),
    })

    yield* Effect.promise(() => exitPromise)

    const results = submitted.current
    if (results !== null && results.length > 0) {
      const action = state.submitAction()
      const outcome = getSubmitOutcome(action, results)
      switch (outcome.type) {
        case "print": {
          const out = results.map((r) => formatResult(r, opts.format, opts.useColor)).join("")
          process.stdout.write(out)
          break
        }
        case "navigate": {
          process.stdout.write(`__CD__:${outcome.dir}\n`)
          break
        }
        case "spawn": {
          Bun.spawnSync(outcome.cmd, { stdout: "ignore", stderr: "ignore" })
          break
        }
        case "osc52": {
          const b64 = Buffer.from(outcome.text, "utf-8").toString("base64")
          process.stdout.write(`\x1b]52;c;${b64}\x07`)
          break
        }
        case "clipboard": {
          const ok = tryPlatformClipboard(outcome.text)
          if (!ok) {
            // Fallback to printing so the user at least gets the path
            process.stdout.write(outcome.text + "\n")
          }
          break
        }
      }
    }

    // Final cleanup — restore terminal modes and release resources.
    // Disable clear-on-shutdown first so our printed output survives.
    ;(renderer as any).clearOnShutdown = false
    renderer.destroy()
  })
