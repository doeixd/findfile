import { Duration, Effect, Fiber, Runtime } from "effect"
import { createSignal, type Accessor, type Setter } from "solid-js"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import type { QueryRouter } from "#core/query/router.ts"
import type { PreviewService, PreviewSlice } from "#core/preview/file.ts"
import type { FffFinder } from "#core/backends/fff-finder.ts"
import { makeDebouncedRunner } from "#core/query/debounce.ts"
import { parseModifiedSince } from "#core/filter.ts"
import { SearchPath, type Mode, type ModeDefaults, type SearchFilters, type SearchResult } from "#core/schema.ts"
import type { SubmitAction, SubmitActionName } from "./submit-action.ts"
import { cycleSubmitAction } from "./submit-action.ts"

const MODES: readonly Mode[] = ["files", "content", "dirs", "semantic"] as const

export interface ScanProgress {
  readonly scannedFilesCount: number
  readonly isScanning: boolean
  readonly isWatcherReady: boolean
  readonly isWarmupComplete: boolean
}

export interface AppState {
  readonly query: Accessor<string>
  readonly setQuery: Setter<string>
  readonly mode: Accessor<Mode>
  readonly cycleMode: () => void
  readonly cycleModeReverse: () => void
  readonly setMode: Setter<Mode>
  readonly results: Accessor<readonly SearchResult[]>
  readonly selected: Accessor<number>
  readonly setSelected: Setter<number>
  readonly moveSelection: (delta: number) => void
  readonly preview: Accessor<PreviewSlice | null>
  readonly previewError: Accessor<string | null>
  readonly status: Accessor<string>
  readonly selectedResult: Accessor<SearchResult | null>
  readonly marks: Accessor<ReadonlySet<string>>
  readonly setMarks: Setter<ReadonlySet<string>>
  readonly toggleMark: () => void
  readonly markedResults: Accessor<readonly SearchResult[]>
  /** Current scan progress for the cwd */
  readonly scanProgress: Accessor<ScanProgress>
  /** Navigate query history: -1 = older, +1 = newer */
  readonly cycleQueryHistory: (direction: -1 | 1) => void
  /** Preview scroll offset in lines (0 = start at startLine) */
  readonly previewScroll: Accessor<number>
  readonly scrollPreview: (delta: number) => void
  /** Whether scrollbars are visible in scrollable panes */
  readonly showScrollbars: Accessor<boolean>
  readonly toggleScrollbars: () => void
  /** Whether the preview pane is visible */
  readonly showPreview: Accessor<boolean>
  readonly togglePreview: () => void
  /** Preview pane weight (0–1), rest goes to results */
  readonly previewWeight: Accessor<number>
  readonly increasePreviewWidth: () => void
  readonly decreasePreviewWidth: () => void
  /** Current submit action (what Enter does) */
  readonly submitAction: Accessor<SubmitAction>
  readonly setSubmitAction: (action: SubmitAction) => void
  readonly cycleSubmitAction: () => void
  /** Current working directory */
  readonly cwd: Accessor<string>
  readonly setCwd: (cwd: string) => void
  /** Whether breadcrumbs path bar is visible */
  readonly showBreadcrumbs: Accessor<boolean>
  readonly toggleBreadcrumbs: () => void
  /** Whether status bar is visible */
  readonly showStatusBar: Accessor<boolean>
  readonly toggleStatusBar: () => void
  /** Whether breadcrumb path input is in edit mode */
  readonly breadcrumbEditing: Accessor<boolean>
  readonly setBreadcrumbEditing: Setter<boolean>
  /** Current value of the breadcrumb path input while editing */
  readonly breadcrumbEditValue: Accessor<string>
  readonly setBreadcrumbEditValue: Setter<string>
  /** Clean up all pending timers, fibers, and resources */
  readonly cleanup: () => void
}

export interface AppLayoutPrefs {
  readonly previewWeight: number
  readonly showPreview: boolean
  readonly showBreadcrumbs: boolean
  readonly showStatusBar: boolean
  readonly showScrollbars: boolean
}

export interface AppDeps {
  readonly router: QueryRouter
  readonly preview: PreviewService
  readonly finder: FffFinder
  readonly cwd: SearchPath
  readonly initialMode: Mode
  readonly limit: number
  readonly runtime: Runtime.Runtime<never>
  readonly modeDefaults: Readonly<Record<string, ModeDefaults>>
  readonly layout?: AppLayoutPrefs
}

/**
 * Wires Solid signals to the router + preview services. Every keystroke
 * re-queries via a debounced runner; every selection change fetches a
 * new preview via the provided Effect runtime.
 */
export const createAppState = (deps: AppDeps): AppState => {
  /** Log through the Effect runtime so messages go to the configured
   *  file logger instead of corrupting the TUI with console output. */
  const log = (message: string) => {
    Runtime.runSync(deps.runtime)(Effect.log(message))
  }

  const [query, setQuery] = createSignal("")
  const [mode, setMode] = createSignal<Mode>(deps.initialMode)
  const [results, setResults] = createSignal<readonly SearchResult[]>([])
  const [selected, setSelected] = createSignal(0)
  const [preview, setPreview] = createSignal<PreviewSlice | null>(null)
  const [previewError, setPreviewError] = createSignal<string | null>(null)
  const [previewScroll, setPreviewScroll] = createSignal(0)
  const [status, setStatus] = createSignal("ready")
  const [marks, setMarks] = createSignal<ReadonlySet<string>>(new Set())
  const [scanProgress, setScanProgress] = createSignal<ScanProgress>({
    scannedFilesCount: 0,
    isScanning: true,
    isWatcherReady: false,
    isWarmupComplete: false,
  })
  const layout = deps.layout
  const [showScrollbars, setShowScrollbars] = createSignal(layout?.showScrollbars ?? true)
  const [showPreview, setShowPreview] = createSignal(layout?.showPreview ?? true)
  const [previewWeight, setPreviewWeight] = createSignal(layout?.previewWeight ?? 0.4)
  const [submitAction, setSubmitAction] = createSignal<SubmitAction>({ type: "print" })
  const [cwd, setCwd] = createSignal<string>(deps.cwd)
  const [showBreadcrumbs, setShowBreadcrumbs] = createSignal(layout?.showBreadcrumbs ?? true)
  const [showStatusBar, setShowStatusBar] = createSignal(layout?.showStatusBar ?? true)
  const [breadcrumbEditing, setBreadcrumbEditing] = createSignal(false)
  const [breadcrumbEditValue, setBreadcrumbEditValue] = createSignal("")

  const cycleSubmitActionImpl = () => {
    const current = submitAction().type
    const customAvailable = submitAction().customCmd !== undefined
    const next = cycleSubmitAction(current, customAvailable)
    setSubmitAction({ type: next, customCmd: submitAction().customCmd })
  }

  // Debounced preview loader
  let previewTimeout: ReturnType<typeof setTimeout> | null = null
  let previewFiber: Fiber.RuntimeFiber<void, never> | null = null

  // Poll scan progress until complete
  let pollScanTimeout: ReturnType<typeof setTimeout> | null = null
  let wasScanning = true
  let pollCount = 0
  const pollScan = () => {
    try {
      pollCount++
      const currentCwd = cwd()
      const progress = Runtime.runSync(deps.runtime)(
        deps.finder.getScanProgress(SearchPath.make(currentCwd)),
      )
      setScanProgress(progress)

      if (pollCount <= 5 || pollCount % 10 === 0) {
        log(
          `pollScan #${pollCount} cwd=${currentCwd} isScanning=${progress.isScanning} warmup=${progress.isWarmupComplete} scanned=${progress.scannedFilesCount}`,
        )
      }

      // If scan just finished and we have a pending query,
      // automatically re-run the search so the user doesn't have to type again.
      const currentQuery = query()
      if (wasScanning && !progress.isScanning && progress.isWarmupComplete) {
        log(`scan complete, triggering search for "${currentQuery}"`)
        if (currentQuery.length > 0) {
          runSearch(currentQuery, mode())
        } else {
          setStatus("ready")
        }
      }
      wasScanning = progress.isScanning

      // Safety valve: stop polling after ~15s of no progress change
      // to avoid spinning forever if the backend is stuck.
      const keepPolling = progress.isScanning || pollCount < 75
      if (keepPolling) {
        pollScanTimeout = setTimeout(pollScan, 200)
      } else {
        log(`pollScan safety valve hit for ${currentCwd}`)
        // Even if the backend still claims isScanning, try searching.
        // getScanProgress can be conservative; fileSearch may already work.
        if (currentQuery.length > 0) {
          log(`safety valve triggering search for "${currentQuery}"`)
          runSearch(currentQuery, mode())
        } else {
          setStatus("ready")
        }
      }
    } catch (e) {
      log(`pollScan error: ${String(e)}`)
      setScanProgress({
        scannedFilesCount: 0,
        isScanning: false,
        isWatcherReady: false,
        isWarmupComplete: true,
      })
    }
  }
  pollScan()

  // Query history (persisted)
  const historyPath = path.join(os.homedir(), ".local", "share", "findfile", "history.json")
  let queryHistory: string[] = []
  let historyIndex = -1

  // Load persisted history
  try {
    if (fs.existsSync(historyPath)) {
      const raw = fs.readFileSync(historyPath, "utf-8")
      if (raw.length > 0) {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed)) {
          queryHistory = parsed.filter((s): s is string => typeof s === "string").slice(-500)
        }
      }
    }
  } catch {
    // ignore load errors
  }

  let historySaveTimeout: ReturnType<typeof setTimeout> | null = null
  const saveHistory = (): void => {
    if (historySaveTimeout !== null) clearTimeout(historySaveTimeout)
    historySaveTimeout = setTimeout(() => {
      historySaveTimeout = null
      try {
        fs.mkdirSync(path.dirname(historyPath), { recursive: true })
        fs.writeFileSync(historyPath, JSON.stringify(queryHistory.slice(-500)))
      } catch {
        // ignore save errors
      }
    }, 1000)
  }

  const runner = Runtime.runSync(deps.runtime)(makeDebouncedRunner(Duration.millis(120)))

  const buildFilters = (m: Mode): SearchFilters | undefined => {
    const defaults = deps.modeDefaults[m]
    if (defaults === undefined) return undefined
    const globs = defaults.globs !== undefined && defaults.globs.length > 0 ? defaults.globs : undefined
    const types = defaults.types !== undefined && defaults.types.length > 0 ? defaults.types : undefined
    const maxDepth = defaults.maxDepth
    const modifiedSinceSec =
      defaults.modifiedSince !== undefined
        ? parseModifiedSince(defaults.modifiedSince) ?? undefined
        : undefined
    const caseInsensitive = defaults.caseInsensitive
    const wordBoundary = defaults.wordBoundary
    const beforeContext = defaults.beforeContext
    const afterContext = defaults.afterContext
    const hasAny =
      globs !== undefined ||
      types !== undefined ||
      maxDepth !== undefined ||
      modifiedSinceSec !== undefined ||
      caseInsensitive !== undefined ||
      wordBoundary !== undefined ||
      beforeContext !== undefined ||
      afterContext !== undefined
    if (!hasAny) return undefined
    return {
      ...(globs !== undefined ? { globs } : {}),
      ...(types !== undefined ? { types } : {}),
      ...(maxDepth !== undefined ? { maxDepth } : {}),
      ...(modifiedSinceSec !== undefined ? { modifiedSinceSec } : {}),
      ...(caseInsensitive !== undefined ? { caseInsensitive } : {}),
      ...(wordBoundary !== undefined ? { wordBoundary } : {}),
      ...(beforeContext !== undefined ? { beforeContext } : {}),
      ...(afterContext !== undefined ? { afterContext } : {}),
    }
  }

  const runSearch = (text: string, m: Mode): void => {
    if (text.length === 0) {
      setResults([])
      setSelected(0)
      setPreview(null)
      setStatus("ready")
      return
    }
    // Save to history (deduplicated, most recent at end)
    const existing = queryHistory.indexOf(text)
    if (existing >= 0) queryHistory.splice(existing, 1)
    queryHistory.push(text)
    historyIndex = queryHistory.length
    saveHistory()

    const filters = buildFilters(m)
    const stream = deps.router.search({
      text,
      mode: m,
      cwd: SearchPath.make(cwd()),
      limit: deps.limit,
      grepMode: deps.modeDefaults[m]?.grepMode ?? "plain",
      ...(filters !== undefined ? { filters } : {}),
    })
    const effect = runner.run(
      stream,
      (r) =>
        Effect.sync(() => {
          setResults((prev) => (prev.length >= deps.limit ? prev : [...prev, r]))
        }),
      () =>
        Effect.sync(() => {
          setResults([])
          setSelected(0)
          setStatus(`searching "${text}" (${m})`)
        }),
    )
    Runtime.runFork(deps.runtime)(effect)
  }

  const runPreview = (r: SearchResult | null): void => {
    if (previewTimeout !== null) clearTimeout(previewTimeout)
    previewTimeout = setTimeout(() => {
      previewTimeout = null
      // Interrupt any in-flight preview read
      if (previewFiber !== null) {
        Runtime.runFork(deps.runtime)(Fiber.interrupt(previewFiber))
        previewFiber = null
      }
      if (r === null) {
        setPreview(null)
        setPreviewError(null)
        setPreviewScroll(0)
        return
      }
      if (r.kind === "dir") {
        setPreview(null)
        setPreviewError(null)
        setPreviewScroll(0)
        return
      }
      const line = r.match?.line ?? null
      const fiber = Runtime.runFork(deps.runtime)(
        deps.preview.read(r.path, line).pipe(
          Effect.matchEffect({
            onSuccess: (slice) =>
              Effect.sync(() => {
                setPreview(slice)
                setPreviewError(null)
                setPreviewScroll(0)
              }),
            onFailure: (err) =>
              Effect.sync(() => {
                setPreview(null)
                setPreviewError(String(err))
                setPreviewScroll(0)
              }),
          }),
        ),
      )
      previewFiber = fiber
    }, 80)
  }

  const boundSetQuery: Setter<string> = ((v) => {
    const next = setQuery(v as string)
    runSearch(next, mode())
    return next
  }) as Setter<string>

  const boundSetMode: Setter<Mode> = ((v) => {
    const next = setMode(v as Mode)
    runSearch(query(), next)
    return next
  }) as Setter<Mode>

  const boundSetCwd = (v: string): string => {
    const next = setCwd(v)
    // Clear stale results while the new directory indexes
    setResults([])
    setSelected(0)
    setPreview(null)
    setStatus("indexing...")
    // Reset poll count so the safety valve starts fresh for the new dir
    pollCount = 0
    // Pre-warm the finder for the new directory so the first search
    // doesn't hit a cold index.
    Runtime.runFork(deps.runtime)(
      deps.finder.get(SearchPath.make(next)).pipe(
        Effect.tap(() => Effect.log(`finder ready for ${next}`)),
        Effect.tapError((e) =>
          Effect.sync(() => {
            log(`finder creation failed for ${next}: ${String(e)}`)
            setStatus(`index error: ${String(e)}`)
          }),
        ),
        Effect.catchAll(() => Effect.succeed(undefined)),
      ),
    )
    // Restart scan polling for the new cwd
    if (pollScanTimeout !== null) {
      clearTimeout(pollScanTimeout)
      pollScanTimeout = null
    }
    wasScanning = true
    log(`starting pollScan for new cwd: ${next}`)
    pollScan()
    return next
  }

  const moveSelection = (delta: number): void => {
    setSelected((i) => {
      const n = results().length
      if (n === 0) return 0
      const next = Math.max(0, Math.min(n - 1, i + delta))
      runPreview(results()[next] ?? null)
      return next
    })
  }

  const cycleMode = (): void => {
    const idx = MODES.indexOf(mode())
    const next = MODES[(idx + 1) % MODES.length]!
    boundSetMode(next)
  }

  const cycleModeReverse = (): void => {
    const idx = MODES.indexOf(mode())
    const next = MODES[(idx - 1 + MODES.length) % MODES.length]!
    boundSetMode(next)
  }

  const selectedResult: Accessor<SearchResult | null> = () =>
    results()[selected()] ?? null

  const toggleMark = (): void => {
    const r = selectedResult()
    if (r === null) return
    setMarks((prev) => {
      const next = new Set(prev)
      if (next.has(r.path)) next.delete(r.path)
      else next.add(r.path)
      return next
    })
  }

  const markedResults: Accessor<readonly SearchResult[]> = () => {
    const set = marks()
    if (set.size === 0) return []
    return results().filter((r) => set.has(r.path))
  }

  const cycleQueryHistory = (direction: -1 | 1): void => {
    if (queryHistory.length === 0) return
    const nextIndex = Math.max(0, Math.min(queryHistory.length, historyIndex + direction))
    if (nextIndex === queryHistory.length) {
      // Past the end: restore empty or current draft (simplified: empty)
      historyIndex = nextIndex
      setQuery("")
    } else {
      historyIndex = nextIndex
      setQuery(queryHistory[historyIndex] ?? "")
    }
  }

  const scrollPreview = (delta: number): void => {
    setPreviewScroll((s) => Math.max(0, s + delta))
  }

  const toggleScrollbars = (): void => {
    setShowScrollbars((v) => !v)
  }

  const togglePreview = (): void => {
    setShowPreview((v) => !v)
  }

  const increasePreviewWidth = (): void => {
    setPreviewWeight((w) => Math.min(0.8, Math.round((w + 0.2) * 10) / 10))
  }

  const decreasePreviewWidth = (): void => {
    setPreviewWeight((w) => Math.max(0.1, Math.round((w - 0.2) * 10) / 10))
  }

  return {
    query,
    setQuery: boundSetQuery,
    mode,
    setMode: boundSetMode,
    cycleMode,
    cycleModeReverse,
    results,
    selected,
    setSelected,
    moveSelection,
    preview,
    previewError,
    previewScroll,
    scrollPreview,
    status: () => {
      const n = results().length
      const marked = marks().size
      const markSuffix = marked > 0 ? ` · ${marked} marked` : ""
      return `${status()} — ${n} result${n === 1 ? "" : "s"}${markSuffix}`
    },
    selectedResult,
    marks,
    setMarks,
    toggleMark,
    markedResults,
    scanProgress,
    cycleQueryHistory,
    showScrollbars,
    toggleScrollbars,
    showPreview,
    togglePreview,
    previewWeight,
    increasePreviewWidth,
    decreasePreviewWidth,
    submitAction,
    setSubmitAction,
    cycleSubmitAction: cycleSubmitActionImpl,
    cwd,
    setCwd: boundSetCwd,
    showBreadcrumbs,
    toggleBreadcrumbs: () => setShowBreadcrumbs((v) => !v),
    showStatusBar,
    toggleStatusBar: () => setShowStatusBar((v) => !v),
    breadcrumbEditing,
    setBreadcrumbEditing,
    breadcrumbEditValue,
    setBreadcrumbEditValue,
    cleanup: () => {
      if (previewTimeout !== null) {
        clearTimeout(previewTimeout)
        previewTimeout = null
      }
      if (previewFiber !== null) {
        Runtime.runFork(deps.runtime)(Fiber.interrupt(previewFiber))
        previewFiber = null
      }
      if (pollScanTimeout !== null) {
        clearTimeout(pollScanTimeout)
        pollScanTimeout = null
      }
      if (historySaveTimeout !== null) {
        clearTimeout(historySaveTimeout)
        historySaveTimeout = null
      }
      Runtime.runFork(deps.runtime)(runner.dispose)
    },
  }
}
