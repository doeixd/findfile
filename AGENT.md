# findfile

A Bun-based TUI for finding and searching files.

## Goals

- Standard CLI args (files / directories / content / semantic content)
- Attractive TUI via opentui — **Solid.js** integration, not React
- Gitignore support
- Fast search via `@ff-labs/fff-bun`
- First-class markdown semantic search via `@tobilu/qmd`
- Configurable layouts / keymap / theme
- Single-binary compile via `bun build --compile`, multi-platform
- Effect-TS throughout for CLI, errors, logging, observability, config

## Architecture

**Library-first.** The core (search backends, config, filters, data
types) lives under `src/core/**` as a reusable library of primitives
with zero imports from the TUI layer. The TUI (`src/tui/**`) composes
those primitives into the app. The library is not published — this is
purely a layering discipline.

```
src/core/      # primitives: schema, errors, backends, router, config
src/tui/       # Solid JSX components composing core
src/bin/       # @effect/cli entrypoint
```

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Bun `>= 1.0` | Required by fff-bun |
| TUI | `@opentui/solid` | JSX + Solid.js, not React |
| Fast search | `@ff-labs/fff-bun` | Rust FFI, Git-aware |
| Semantic search | `@tobilu/qmd` | BM25 + vector + LLM rerank |
| Effect framework | `effect`, `@effect/cli`, `@effect/platform-bun` | Services, Stream, Layer |
| Schema | `effect/Schema` | Types, branded IDs, config validation, tagged errors |
| Gitignore | `ignore` | Fallback/augment the backend filter |
| Config format | TOML | parsed via `smol-toml`, decoded via Schema |
| LSP | `@effect/language-service` | Tsconfig plugin |

## Effect-TS usage

- **Services**: backends and the router are `Effect.Service` classes with
  `accessors: true` and dependencies declared in the service.
- **Errors**: `Schema.TaggedError` per distinct failure (`BackendInitError`,
  `SearchExecutionError`, `ConfigLoadError`, `QmdUnavailableError`, …).
  Use `catchTag` / `catchTags` — never `catchAll`.
- **Streaming**: search returns `Stream.Stream<SearchResult, BackendError>`
  so results render incrementally and stale queries are interruptible.
- **CLI**: `@effect/cli`'s `Command.make` + `Options` / `Args`, run via
  `BunContext.layer` + `BunRuntime.runMain`.
- **Schema**: branded entity types, TOML config decoded through a Schema
  so invalid config fails fast with precise errors.
- **Observability**: `Effect.fn("Namespace.method")` for automatic spans,
  `Effect.log` (never `console.log`), `Metric.counter` for result
  counts, `Config.*` for env vars (never `process.env`).
- **Layers**: flat `Layer.mergeAll` at the app root. Deep `Layer.provide`
  nesting is avoided for LSP performance.

## Upstream references (source-verified)

- **opentui** — https://github.com/anomalyco/opentui
  - `packages/core` (runtime) + `packages/solid` (JSX binding)
  - Setup: `tsconfig.jsx = "preserve"`, `jsxImportSource = "@opentui/solid"`,
    `bunfig.preload = ["@opentui/solid/preload"]`
  - JSX tags: `text, box, scrollbox, input, textarea, select, tab_select,
    code, line_number, diff, span, ascii_font`
  - Hooks: `useKeyboard`, `useTimeline`, `usePaste`
- **fff-bun** — https://github.com/dmtrKovalenko/fff.nvim (npm `@ff-labs/fff-bun`)
  - Class API: `FileFinder.init({ basePath, … })`, instance methods
    `search`, `grep`, `trackAccess`, `getScanProgress`, `destroy`
  - Git-aware; platform-specific prebuilt Rust libs via optional deps
- **qmd** — https://github.com/tobi/qmd (npm `@tobilu/qmd`)
  - SDK: `createStore({ dbPath, config: { collections: {...} } })`,
    `store.search / searchLex / searchVector / get / multiGet`
  - SDK is Bun-compatible per its README, despite `engines.node` in its
    package.json (that's the CLI target)

## qmd ↔ `bun build --compile` caveat

qmd depends on native modules (`better-sqlite3`, `node-llama-cpp`,
`sqlite-vec`) and needs external GGUF model files on disk. These do not
bundle cleanly into a single cross-platform binary.

**Resolution**: dev mode uses qmd directly for first-class semantic
search. Compiled binaries treat qmd as runtime-optional — if the import
fails or models aren't available, `semantic` mode is disabled in the
status bar and the app falls back to `files` / `dirs` / `content`
without crashing.

## Discoveries

- **Alternate-screen discards stdout on exit**: create renderer manually, switch to `main-screen` before printing, then `renderer.destroy()`.
- **`alt+o` parses as `meta=true`**: `parseKeyChord` treats `alt` and `meta` as equivalent.
- **`flexGrow` is content-sensitive**: use explicit percentage `width` for pane splits.
- **`isInputKey` swallowed modified arrows**: only treat arrows as input when no modifiers held.
- **`fff-bun` `directorySearch` broken in v0.6.1**: dirs mode falls back to `fileSearch` + extracting parent directories.

## Recent changes

- **Breadcrumbs**: borderless, muted styling; positioned above query input.
- **Layout customization**: config `[layout]` supports `showPreview`, `previewWeight`, `showBreadcrumbs`, `showStatusBar`, `showScrollbars`.
- **Default theme**: more subtle text colors (reduced contrast on results, preview, and status bar).
- **Keymap**: `alt+b` toggles status bar visibility.

## Plan

Living implementation plan: see `docs/plan.md`.
Next recommended: Wave 5 — CI, snapshot tests, benchmark harness, observability.
