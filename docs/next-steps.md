# findfile — next-steps plan

Follow-up roadmap after v0.1. Grouped by theme, ordered by user-visible
value per unit of effort. Each item has a concrete deliverable so it can
be broken out into its own PR.

The three **★** items are the recommended first wave — together they
turn findfile from "works in its own TUI" into "composes with the rest
of a developer's shell".

---

## Wave 1 — output, filters, integration (recommended first)

Three focused PRs. Each is small, each unlocks real workflows.

### PR 1 — Output & pipeability (★ biggest gap)

**Goal:** make `findfile | tool` work the way every Unix user expects.

- `--format <path|line|json|null>`
  - `path` (default, no TTY): one relative path per line
  - `line`: `path:line:col<TAB>preview` for grep-like tools
  - `json`: JSONL — one `SearchResult` per line, for `jq` / editor integrations
  - `null`: `\0`-separated paths, for `xargs -0`
- `--color <always|auto|never>` with ANSI highlight of `match.ranges`
  (we already carry them from fff-grep — today we throw them away at the
  `process.stdout.write` call in `src/bin/findfile.ts:76`).
- **Grep-style exit codes**: `0` = at least one hit, `1` = no hits,
  `2` = error. Shell scripts can't branch on "found anything" today.
- **TTY auto-detect**: when `process.stdout.isTTY === false`, default to
  `--no-tui` with `--format path`. So `findfile foo | head` works with
  zero flags.

**Files touched:** `src/bin/findfile.ts`, new `src/core/format.ts` for
the formatter functions, new `src/core/exit-code.ts`.

**Acceptance:**
- `findfile foo | head -5` prints 5 paths, no TUI.
- `findfile --format json TODO | jq '.match.preview'` works.
- `findfile --format null . | xargs -0 wc -l` works.
- `findfile nonexistent-string && echo hit || echo miss` prints `miss`.

### PR 2 — Filter flags (parity with rg/fd)

**Goal:** stop users reaching for `rg`/`fd` because our surface is too bare.

- `--glob '*.ts'` (repeatable; `!pattern` for negation)
- `--type ts` (short aliases: `ts`, `py`, `md`, `rust`, `go`, `js`, `tsx`, `json`, `yaml`, `toml`)
- `--hidden` (include dotfiles; default off)
- `--no-ignore` (disable all gitignore/ignore files)
- `--depth N` (max directory depth)
- `--modified-since 2d` / `--modified-since 2026-04-01`
- Content-mode flags: `-i` (case-insensitive), `-w` (word boundary),
  `-C/-B/-A <N>` (context lines — surrounding lines in the match preview).

Wire into `SearchQuery` schema with optional fields; each backend applies
what it can (`fff-files` already supports glob/type natively; fff-grep
supports `-i`/`-w`; context lines we do client-side in `PreviewService`).

**Acceptance:**
- `findfile --glob '*.ts' --hidden useState` matches our own `.vscode/` tsx.
- `findfile --type md --modified-since 7d TODO` scopes to recently edited markdown.
- `findfile -i -C 3 useState` shows 3 lines of context around each match.

### PR 3 — Shell & editor integration (★ library-first payoff)

**Goal:** make the "pick a file → open in editor" loop ergonomic without
forcing the TUI on users who don't want it.

- **TUI multi-select**: `space` marks a row, `enter` prints all marked
  paths to stdout (one per line, respecting `--format`). Solves the
  "open these three files in vim" case.
- **`--preview-cmd '<shell>'`**: fzf-style. Replace the built-in preview
  pane with the user's command. Tokens: `{}` = path, `{line}` = match line.
  Example: `--preview-cmd 'bat --color=always {} -r :{line}'`.
- **Shell function docs**: add `docs/shell-integration.md` with
  `ff()`, `ffe()` (edit selection), `ffg()` (grep + edit) wrappers for
  bash/zsh/fish. This is the actual intended UX — nothing tells users today.
- **Stdin query**: `echo schema | findfile --mode content` reads query
  from stdin when positional arg is missing.
- **Stdin path list**: `git diff --name-only | findfile --paths-from -
  --mode content TODO` restricts search to the given paths.

**Acceptance:**
- `ff` shell function opens editor on TUI-selected file.
- `--preview-cmd 'bat {}'` replaces the preview pane.
- `git ls-files | findfile --paths-from - Foo` searches only tracked files.

---

## Wave 2 — subcommands & discoverability

Flat CLI gets crowded fast. Split administrative ops out.

### `findfile index <path>`

Explicit qmd build. Right now qmd indexes lazily on first semantic
search, which is opaque and slow on first hit. `index` makes it visible
and scriptable (CI, pre-commit).

Flags: `--force` (rebuild), `--model <name>`, `--include '*.md'`.

### `findfile doctor`

Prints: Bun version, fff-bun version + loaded, qmd installed + loadable,
resolved config files in precedence order, platform build target, TTY
status. One stop-shop for "why doesn't semantic search work".

### `findfile config print` / `findfile config path`

- `print`: effective merged config (YAML or TOML) with source annotations
  per-field.
- `path`: list of config files in precedence order, marking which exist.

Implementation: hoist `ConfigService.load`'s merge to return the chain,
not just the final value.

---

## Wave 3 — config-as-product

Things the config file can do that flags can't.

### Saved queries

```toml
[queries.todos]
text = "TODO|FIXME"
mode = "content"
grepMode = "regex"

[queries.recent-md]
mode = "files"
glob = ["*.md"]
modifiedSince = "7d"
```

Invoked as `findfile :todos` (colon prefix distinguishes from positional
query). This is what `git alias` is to `git`.

### `.findfileignore`

Alongside `.gitignore`. Same syntax (`ignore` package supports it out of
the box). For search-only excludes — stuff you *want* in git but don't
want in search results (lockfiles, generated dirs, migrations).

### Frecency ✅

Implemented via `fff-bun`'s built-in `trackQuery(query, selectedPath)`.
`FileFinder.create` is initialized with `frecencyDbPath` and
`historyDbPath` pointing to `~/.local/share/findfile/`. On TUI submit,
every selected result is tracked against the current query text. The
Rust layer handles scoring (`count * exp(-(now - most_recent) / halflife)`)
and boosts results automatically on subsequent searches.

### Per-mode defaults ✅

```toml
[modeDefaults.content]
caseInsensitive = true
beforeContext = 3
afterContext = 3

[modeDefaults.semantic]
grepMode = "regex"
```

Merged into `SearchQuery` in both CLI and TUI. CLI flags override mode
defaults; arrays (globs, types) are merged. Config schema supports all
`SearchFilters` fields plus `grepMode`.

---

## Wave 4 — extensibility (the "library-first" payoff)

### Custom backend plugin

Config block:

```toml
[[backends.custom]]
name = "ast-grep"
mode = "content"
command = "sg --pattern {query} --json=stream"
# command emits JSONL with { relativePath, match: { line, col, preview } }
```

Router composes `CustomBackend` alongside built-ins via the existing
`Backend` contract in `src/core/backends/backend.ts`. This is the
cleanest answer to "bring your own indexer" and is the biggest lever
for the library-first architecture.

Key work: a `ShellBackend` that wraps a child process as a `Stream<SearchResult>`
with proper interruption (`AbortController` on `Stream` finalize).

### RPC mode

`findfile serve --socket /tmp/ff.sock` exposes the router over a local
unix socket / named pipe (Windows). Editors (Neovim, VS Code) can
connect and query without respawning the whole process per keystroke.
Effect-Cluster RPC is a natural fit and we already have the service
layer built.

Optional; only worth it if we start getting editor-plugin requests.

---

## Wave 5 — robustness & quality

Not user-visible, but keeps the project healthy.

### Tests

- **Snapshot tests** for each `--format` on a fixture tree.
- **Integration tests** per backend using a temp dir seeded with known
  files; currently we have smoke tests, not real assertions.
- **TUI tests**: Solid components tested with `@opentui/core`'s headless
  renderer (if available) — at minimum test the state machine in
  `src/tui/state.ts` without JSX.

### Observability

- Add `--verbose` / `--trace` that turns on Effect's tracing printer.
  We already use `Effect.fn("...")` span names — they're invisible today.
- Optional OTLP export (`OTEL_EXPORTER_OTLP_ENDPOINT`) for people running
  findfile in CI and wanting the trace.

### Error surface

Audit `catchTag`/`catchTags` coverage. Add specific errors for:
- `GlobParseError` (bad `--glob` pattern)
- `ModifiedSinceParseError` (bad `--modified-since` value)
- `ConfigMergeError` with the field path + both sources

Today some of these would fall through to a generic Effect defect with
an ugly stack.

### Perf

- **Parallel backend fanout** with bounded concurrency — currently
  `Stream.merge` but the backends are mostly sequential inside.
- **Cached fff-bun index** per cwd (invalidate on mtime) — first query
  is cold and shows in the TUI as a visible pause.
- **Benchmark harness** in `bench/` using a fixed corpus (e.g. linux
  kernel tree) so we can see regressions.

### CI

- GitHub Actions matrix: `{ubuntu, macos, windows} × {x64, arm64}`.
  Run `bun test` + `bun run typecheck` + `bun run build` on each.
- Release job: tag → build binaries for all 6 targets → upload to
  GitHub release.

---

## Visual / TUI polish (from the opencode highlighting research)

See `docs/opencode-highlighting.md` for the research. Concrete TODOs:

- **Preview pane syntax highlighting** via `SyntaxStyle.fromTheme(...)`.
  Add a `Theme` context, render preview as
  `<code filetype={extToLang(path)} syntaxStyle={syntax()} content={...} />`.
- **Match-range highlighting in results list** — plumb `match.ranges`
  through `SearchResult` into the row renderer and paint those columns
  via `<span style={{ fg: theme.matchFg, bg: theme.matchBg }}>...</span>`.
  Opencode doesn't do this; it's a concrete differentiator.
- **Themes**: lift `theme` from a constant to a TOML-configurable object
  (`[theme]` block + preset names like `dark`, `light`, `tokyo-night`).

---

## Proposed order

Shipped so far:
1. ✅ Output formats + exit codes + TTY auto-detect (Wave 1 / PR 1)
2. ✅ Match highlighting — both ANSI (`--color`) and TUI spans (Wave 1 PR 1 + visual polish)
3. ✅ Filter flags (Wave 1 / PR 2)
4. ✅ Shell integration + multi-select + `--preview-cmd` (Wave 1 / PR 3)
5. ✅ `doctor` + `config print` (Wave 2)
6. ✅ Saved queries + `.findfileignore` (Wave 3)
7. ✅ Syntax highlighting in preview (visual polish)
8. ✅ Custom backend plugin (`ShellBackend`) (Wave 4)
9. ✅ Theme system + TypeScript configs (visual polish + config)
10. ✅ Command/keymap system + help overlay (UX)
11. ✅ Frecency + per-mode defaults (Wave 3)

**Next recommended work:**
- Tests + CI + observability (Wave 5) — snapshot tests, GitHub Actions,
  `--verbose`/`--trace`, benchmark harness, headless TUI tests.
- Optional: RPC mode (`findfile serve --socket`) (Wave 4) — only if
  editor-plugin requests emerge.

Waves 1 through 3 are now complete. The project has parity with `rg`/
`fd`/`fzf` on core workflows, plus unique differentiators (semantic
search, custom backends, comprehensive theming). Everything remaining is
robustness, quality, and ecosystem.
