# findfile — implementation plan

## Context

`findfile` is a Bun-based TUI file finder scoped by `AGENT.md`: CLI
args, attractive TUI, gitignore support, fast fuzzy search, first-class
markdown semantic search, configurable layout, multi-platform compile.

Architecture is **library-first**: `src/core/**` owns all search /
config / filter logic as Effect-TS primitives; `src/tui/**` composes
them via Solid JSX components. The library is not published — that's
purely a layering discipline so the TUI never reaches into search/
indexing internals.

All third-party APIs below are source-verified (GitHub READMEs + index
files). The plan is written against real signatures, not guesses.

## Stack

- **Runtime**: Bun ≥ 1.0
- **TUI**: `@opentui/solid` (JSX + Solid.js)
- **Fast search**: `@ff-labs/fff-bun` (Rust FFI)
- **Semantic search**: `@tobilu/qmd` (BM25 + vector + rerank)
- **Effect framework**: `effect`, `@effect/cli`, `@effect/platform-bun`
- **Schema / validation**: `effect/Schema` (branded types, tagged errors, config decode)
- **Gitignore**: `ignore`
- **TOML**: `smol-toml`
- **LSP**: `@effect/language-service` (tsconfig plugin)

## Project layout

```
findfile/
  package.json
  tsconfig.json                   # jsx preserve + jsxImportSource + effect LS plugin
  bunfig.toml                     # preload @opentui/solid/preload
  AGENT.md
  docs/
    plan.md                       # this file
  src/
    core/                         # the "library" — zero tui imports
      schema.ts                   # Mode, SearchQuery, SearchResult, branded ids
      errors.ts                   # Schema.TaggedError per failure mode
      config.ts                   # TOML + Schema + precedence merge
      gitignore.ts                # `ignore` wrapper
      backends/
        backend.ts                # Backend contract (Stream-based)
        fff-files.ts              # Effect.Service — FileFinder.search
        fff-grep.ts               # Effect.Service — FileFinder.grep
        qmd.ts                    # Effect.Service — createStore + search (optional)
      query/
        router.ts                 # Effect.Service — route + fan-out + merge
        debounce.ts               # interruption-based debounce
      preview/
        file.ts                   # slice + highlight a file for preview
    tui/                          # Solid components composing core
      app.tsx
      state.ts                    # Solid signals wired to router Stream
      keymap.ts                   # key → action, via useKeyboard
      components/
        QueryInput.tsx
        ResultsList.tsx
        PreviewPane.tsx
        StatusBar.tsx
    bin/
      findfile.ts                 # @effect/cli entry, BunRuntime.runMain
  examples/
    findfile.config.toml
  scripts/
    build-all.ts                  # bun build --compile × 4 targets
```

Invariant: no file under `src/core/**` imports from `src/tui/**` or from
`@opentui/*`. Enforced by review; a tiny lint check can back it up later.

## Verified third-party APIs

### `@opentui/solid`
- **Setup**: `tsconfig.jsx = "preserve"`, `jsxImportSource = "@opentui/solid"`; `bunfig.preload = ["@opentui/solid/preload"]`.
- **Entry**: `render(() => <text>…</text>, renderer?)`.
- **JSX tags**: `text, box, scrollbox, ascii_font, input, textarea, select, tab_select, code, line_number, diff, span, strong, b, em, i, u, br, a`.
- **Hooks / utilities**: `useKeyboard(handler, options?)`, `useTimeline()`, `usePaste()`, plus `onResize / onFocus / onBlur` props, `Portal`, `Dynamic`, `extend()`, `testRender()`.

### `@ff-labs/fff-bun` (v0.6.1)
- **Class**: `FileFinder.init({ basePath, frecencyDbPath?, historyDbPath?, useUnsafeNoLock? })` (also `.create({ basePath })`).
- **Instance**: `search(query, SearchOptions)`, `grep(query, GrepOptions)`, `trackAccess()`, `trackQuery()`, `isScanning()`, `getScanProgress()`, `destroy()`.
- **`SearchOptions`**: `{ maxThreads?, currentFile?, comboBoostMultiplier?, minComboCount?, pageIndex?, pageSize? }`.
- **`GrepOptions`**: `{ mode: "plain" | "regex" | "fuzzy", pageLimit?, fileOffset?, maxFileSize?, maxMatchesPerFile?, smartCase?, timeBudgetMs? }`.
- **Returns**: `Result<T> = { ok: true; value: T } | { ok: false; error: string }`. Adapters must lift these into Effect errors.
- Git-aware (each match carries `gitStatus`). Gitignore at the Rust layer is likely on by default; spike confirms.

### `@tobilu/qmd` (v2.1.0)
- `createStore({ dbPath, config?: { collections }, configPath? })` — inline, YAML, or DB-only reopen.
- `store.search({ query?, intent?, collection?, collections?, limit?, minScore?, rerank?, explain?, queries? })`; sub-queries `queries: [{type:'lex'|'vec'|'hyde', query}]`.
- Direct backends: `searchLex(q, opts)`, `searchVector(q, opts)`, `expandQuery(q, opts)`.
- Retrieval: `get(pathOrDocid)`, `multiGet(globOrCsv, {maxBytes?})`, `getDocumentBody(path, {fromLine?, maxLines?})`.
- Collections: `addCollection(name, {path, pattern?, ignore?})`, `listCollections()`, `removeCollection(name)`, `renameCollection`, `getDefaultCollectionNames()`.
- Bun-compatible at the SDK level despite `engines.node` on the CLI.

### `@effect/cli`
- `Command.make("name", { opts }, handler)`; compose with `Command.withSubcommands`.
- Run: `const cli = Command.run(command, { name, version }); cli(process.argv).pipe(Effect.provide(BunContext.layer), BunRuntime.runMain)`.
- `Options.*` and `Args.*` modules for flags and positional args.

## Core primitives (the "library")

### `src/core/schema.ts`
Effect Schema types + branded IDs. Branded so paths, queries, etc. don't
get confused with plain strings across module boundaries.

```ts
import { Schema } from "effect"

export const Mode = Schema.Literal("files", "dirs", "content", "semantic")
export type Mode = typeof Mode.Type

export const SearchPath = Schema.String.pipe(Schema.brand("@findfile/SearchPath"))
export type SearchPath = typeof SearchPath.Type

export const GrepMode = Schema.Literal("plain", "regex", "fuzzy")
export type GrepMode = typeof GrepMode.Type

export const Match = Schema.Struct({
  line: Schema.Int,
  col: Schema.Int,
  preview: Schema.String,
  ranges: Schema.optional(Schema.Array(Schema.Tuple(Schema.Int, Schema.Int))),
})

export const SearchQuery = Schema.Struct({
  text: Schema.String,
  mode: Mode,
  cwd: SearchPath,
  limit: Schema.optional(Schema.Int.pipe(Schema.positive())),
  grepMode: Schema.optional(GrepMode),
})
export type SearchQuery = typeof SearchQuery.Type

export const SearchResult = Schema.Struct({
  path: SearchPath,
  kind: Schema.Literal("file", "dir"),
  score: Schema.optional(Schema.Number),
  match: Schema.optional(Match),
  gitStatus: Schema.optional(Schema.String),
  source: Schema.Literal("fff", "fff-grep", "qmd"),
})
export type SearchResult = typeof SearchResult.Type
```

### `src/core/errors.ts`
One tagged error per distinct failure. Never collapse to a single generic error.

```ts
import { Schema } from "effect"

export class BackendInitError extends Schema.TaggedError<BackendInitError>()(
  "BackendInitError",
  { backend: Schema.String, cwd: Schema.String, message: Schema.String },
) {}

export class SearchExecutionError extends Schema.TaggedError<SearchExecutionError>()(
  "SearchExecutionError",
  { backend: Schema.String, query: Schema.String, message: Schema.String },
) {}

export class ConfigLoadError extends Schema.TaggedError<ConfigLoadError>()(
  "ConfigLoadError",
  { path: Schema.String, message: Schema.String },
) {}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  { path: Schema.String, issues: Schema.String },
) {}

export class QmdUnavailableError extends Schema.TaggedError<QmdUnavailableError>()(
  "QmdUnavailableError",
  { reason: Schema.String },
) {}

export class PreviewReadError extends Schema.TaggedError<PreviewReadError>()(
  "PreviewReadError",
  { path: Schema.String, message: Schema.String },
) {}

export type SearchError =
  | BackendInitError
  | SearchExecutionError
  | QmdUnavailableError
```

### `src/core/backends/backend.ts`
Shared contract. Backends are `Effect.Service`s; `search` returns a
`Stream` so results flow incrementally. Cancellation uses Effect's
natural interruption (caller `Fiber.interrupt`s the stale query).

```ts
import { Stream } from "effect"
import type { SearchQuery, SearchResult } from "../schema"
import type { SearchError } from "../errors"

export interface BackendSearch {
  readonly search: (q: SearchQuery) => Stream.Stream<SearchResult, SearchError>
  readonly supports: (mode: Mode) => boolean
}
```

### `src/core/backends/fff-files.ts`
One `FileFinder` per cwd, memoized. `files` mode → `.search()`; `dirs`
mode → same call, filter on `kind === "dir"` (or a dedicated dir call
if the spike shows one exists). Adapter lifts fff's `Result<T>` into
Effect via `Effect.suspend` + `Effect.fail(new SearchExecutionError(...))`
when `ok === false`. Streaming via `Stream.paginateEffect` over
`pageIndex`.

```ts
export class FffFiles extends Effect.Service<FffFiles>()("findfile/FffFiles", {
  accessors: true,
  effect: Effect.gen(function* () {
    const finders = new Map<string, FileFinder>() // memo per cwd

    const getFinder = Effect.fn("FffFiles.getFinder")(function* (cwd: SearchPath) {
      const hit = finders.get(cwd)
      if (hit) return hit
      const r = FileFinder.init({ basePath: cwd })
      if (!r.ok) return yield* Effect.fail(new BackendInitError({ backend: "fff", cwd, message: r.error }))
      finders.set(cwd, r.value)
      return r.value
    })

    const search = (q: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.paginateEffect(0, (page) => /* call .search, yield results, return next cursor */ …)

    return { search, supports: (m: Mode) => m === "files" || m === "dirs" }
  }),
}) {}
```

### `src/core/backends/fff-grep.ts`
Same shape, wraps `.grep(query, { mode, pageLimit, timeBudgetMs })`.
`match` populated from `GrepMatch`. `timeBudgetMs` exposed via config.

### `src/core/backends/qmd.ts`
Lazy `createStore({ dbPath: "~/.cache/findfile/qmd/<hash(cwd)>.sqlite" })`.
Auto-adds a `.md` collection rooted at cwd if none exists.
**Runtime-optional**: the module import is wrapped in `Effect.tryPromise`
that fails with `QmdUnavailableError` on failure; the router catches
that tag and downgrades `semantic` mode. Compiled binaries will likely
hit this path until qmd is installed separately.

### `src/core/query/router.ts`
`Effect.Service` that fans out:
- `files` / `dirs` → `FffFiles.search`
- `content` → `FffGrep.search`; for `.md` files, upgrade to `Qmd.search` when available
- `semantic` → `Qmd.search`, or `Effect.fail(QmdUnavailableError)` → status bar shows disabled state

Stream merge via `Stream.mergeAll` with score-based reordering in a
windowed buffer. `limit` enforced with `Stream.take`.

### `src/core/query/debounce.ts`
```ts
export const makeDebouncedRunner = (wait: Duration.Duration) =>
  Effect.gen(function* () {
    let fiber: Fiber.RuntimeFiber<...> | undefined
    const run = (effect: Stream.Stream<...>) =>
      Effect.gen(function* () {
        if (fiber) yield* Fiber.interrupt(fiber)
        yield* Effect.sleep(wait)
        fiber = yield* Effect.fork(/* drain effect to sink */)
      })
    return { run }
  })
```

### `src/core/config.ts`
Precedence low→high: defaults → `~/.config/findfile/config.toml` →
`./findfile.config.toml` → CLI flags. TOML parsed via `smol-toml`,
decoded through a Schema so invalid config fails loud.

```ts
export const FindfileConfig = Schema.Struct({
  defaultMode: Schema.optional(Mode),
  layout: Schema.optional(Schema.Struct({
    weights: Schema.Tuple(Schema.Int, Schema.Int),
  })),
  keymap: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  qmd: Schema.optional(Schema.Struct({
    autoIndex: Schema.Boolean,
    modelsDir: Schema.optional(Schema.String),
  })),
  ignore: Schema.optional(Schema.Struct({
    extra: Schema.Array(Schema.String),
  })),
  theme: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
})
```

Loader service uses `@effect/platform-bun`'s `FileSystem` to read files.
Failure → `ConfigLoadError` or `ConfigValidationError` with the full
Schema ParseResult message.

### `src/core/gitignore.ts`
Wraps the `ignore` package. Reads `.gitignore` chain from cwd up;
augments with `config.ignore.extra`. Exposes `isIgnored(path): boolean`.
Used as a fallback when the backend's native filter is off or when
`--no-gitignore` is not set but extras need to apply.

### `src/core/preview/file.ts`
Reads file via `FileSystem`, slices `[line - 5, line + 30]` around the
match, returns text + a `[line, col, length]` decoration list the
PreviewPane can render.

## App (the TUI)

### `src/bin/findfile.ts`
```ts
import { Command, Options, Args } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer } from "effect"

const query    = Args.text({ name: "query" }).pipe(Args.optional)
const mode     = Options.choice("mode", ["files","dirs","content","semantic"]).pipe(Options.withDefault("files"))
const cwd      = Options.directory("cwd").pipe(Options.withDefault("."))
const noTui    = Options.boolean("no-tui")
const noIgnore = Options.boolean("no-gitignore")
const limit    = Options.integer("limit").pipe(Options.optional)
const config   = Options.file("config").pipe(Options.optional)

const findfile = Command.make(
  "findfile",
  { query, mode, cwd, noTui, noIgnore, limit, config },
  (args) => Effect.gen(function* () {
    const router = yield* Router
    const stream = router.search({ /* built from args + config */ })
    if (args.noTui) yield* Stream.runForEach(stream, (r) => Effect.log(r.path))
    else yield* startTui(stream, args)
  }),
)

const cli = Command.run(findfile, { name: "findfile", version: "0.1.0" })

const AppLive = Layer.mergeAll(
  FffFiles.Default,
  FffGrep.Default,
  Qmd.Default,
  Router.Default,
  ConfigService.Default,
)

cli(process.argv).pipe(
  Effect.provide(AppLive),
  Effect.provide(BunContext.layer),
  BunRuntime.runMain,
)
```

### `src/tui/app.tsx`
```tsx
export const App = (props: { stream: Stream.Stream<SearchResult, SearchError>; cfg: Config }) => {
  const state = createAppState(props)
  useKeyboard(handleGlobalKey(state))
  return (
    <box flexDirection="column" width="100%" height="100%">
      <QueryInput state={state} />
      <box flexDirection="row" flexGrow={1}>
        <ResultsList state={state} flexGrow={props.cfg.layout.weights[0]} />
        <PreviewPane state={state} flexGrow={props.cfg.layout.weights[1]} />
      </box>
      <StatusBar state={state} />
    </box>
  )
}
```

### `src/tui/state.ts`
Solid signals, wired to the router via a `createEffect` that drains the
current `Stream` into `setResults`. Query / mode changes interrupt the
fiber and start a new stream (using `Fiber.interrupt` + fresh `Effect.fork`).

Signals:
- `query, setQuery` — string
- `mode, setMode` — Mode
- `results, setResults` — `SearchResult[]`
- `selected, setSelected` — number
- `previewContent` — `createMemo` reading `preview/file.ts` for `results()[selected()]`

### `src/tui/keymap.ts`
Table-driven: `{ "ctrl+c": "quit", "escape": "quit", "tab": "cycle-mode", "up": "prev", "down": "next", "ctrl+p": "prev", "ctrl+n": "next", "enter": "submit" }`. Passed through `useKeyboard`. Config can override individual bindings.

## Gitignore

- Prefer backend-native filter (fff-bun is "Git-aware"). Spike verifies.
- `core/gitignore.ts` augments/falls back as needed and applies
  `config.ignore.extra`.
- `--no-gitignore` disables both layers.

## qmd ↔ `bun --compile` strategy

1. **Dev** — `bun run` uses qmd directly; semantic mode first-class.
2. **Compiled binary** — qmd import is wrapped; if `better-sqlite3` / `node-llama-cpp` / models aren't available at runtime, `QmdUnavailableError` is raised and semantic mode is greyed out in the status bar. `files` / `dirs` / `content` remain fully functional.
3. **Models** — `config.qmd.modelsDir` lets users point to a shared cache so one download serves every project.

## Multi-platform build

`scripts/build-all.ts`:
```
bun build src/bin/findfile.ts --compile --target=bun-linux-x64    --outfile dist/findfile-linux-x64
bun build src/bin/findfile.ts --compile --target=bun-linux-arm64  --outfile dist/findfile-linux-arm64
bun build src/bin/findfile.ts --compile --target=bun-darwin-arm64 --outfile dist/findfile-darwin-arm64
bun build src/bin/findfile.ts --compile --target=bun-windows-x64  --outfile dist/findfile-windows-x64.exe
```
Host-platform smoke run is required; cross-platform verification is a
CI follow-up.

## Implementation order

1. **Scaffold**: `bun init`, install deps, tsconfig (`jsx preserve`,
   `jsxImportSource`, effect LS plugin), `bunfig.toml` (opentui preload).
2. **Spike**: tiny scripts against `FileFinder.search/grep` and qmd
   `createStore` under Bun. Confirm (a) fff-bun gitignore default, (b)
   qmd SDK Bun-compat, (c) pagination/streaming we rely on.
3. **Schema + errors + Backend contract** (`src/core/schema.ts`,
   `errors.ts`, `backends/backend.ts`).
4. **Backends** in order: `fff-files` → `fff-grep` → `qmd` (optional).
   Each with a `bun test` for happy-path + interruption.
5. **Config + gitignore** with Schema decode and precedence merge.
6. **Router + debounce** — exercise via `--no-tui` before touching the TUI.
7. **CLI entry** (`src/bin/findfile.ts`) with `@effect/cli` + BunRuntime.
8. **TUI** skeleton (Solid JSX): `app.tsx`, `QueryInput`, `ResultsList`.
9. **Preview + keymap polish**: slice + highlight; mode cycle; submit/quit.
10. **Build pipeline**: `scripts/build-all.ts`, example config, README
    usage, qmd-optional runtime guard validated in compiled binary.

## Verification

- **Logic tests (`bun test`)**: config decoding + precedence; router
  mode routing; gitignore edge cases. Logic only — no real TUI, no
  network, tmpdir fixtures.
- **Integration via `--no-tui`** (exercises core end-to-end without opentui):
  - `findfile --mode files "app" --cwd ./fixtures/sample` streams files
  - `findfile --mode content "TODO"` streams grep hits as `path:line:col`
  - `findfile --mode semantic "auth flow" --cwd ./fixtures/md` returns
    qmd hits with scores (needs models; skippable with env flag)
- **TUI smoke (manual)**: type → results stream; arrows + Ctrl+P/N
  navigate; preview updates; Tab cycles mode; Enter prints selection on
  exit; Esc quits cleanly; `QmdUnavailableError` greys out semantic mode.
- **Compile smoke**: host-platform binary from `scripts/build-all.ts`
  run against a fixture dir, parity with dev. Confirm graceful qmd-off
  fallback in the compiled binary.

## Critical files to create

- `package.json`, `tsconfig.json`, `bunfig.toml`
- `src/core/schema.ts`
- `src/core/errors.ts`
- `src/core/backends/backend.ts`
- `src/core/backends/fff-files.ts`
- `src/core/backends/fff-grep.ts`
- `src/core/backends/qmd.ts`
- `src/core/query/router.ts`
- `src/core/query/debounce.ts`
- `src/core/config.ts`
- `src/core/gitignore.ts`
- `src/core/preview/file.ts`
- `src/tui/app.tsx`
- `src/tui/state.ts`
- `src/tui/keymap.ts`
- `src/tui/components/{QueryInput,ResultsList,PreviewPane,StatusBar}.tsx`
- `src/bin/findfile.ts`
- `scripts/build-all.ts`
- `examples/findfile.config.toml`
