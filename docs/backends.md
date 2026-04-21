# Backend Selection

findfile supports pluggable search backends. By default it uses
`fff-bun` (Rust-based, bundled) for all modes, but you can swap in
external tools like `ripgrep` or `fd` via config.

## Why use external backends?

- **ripgrep (`rg`)** — PCRE2 regex, multiline search, familiar grep
  semantics. Power users who already have `rg` aliases may prefer it.
- **fd** — Fast, intuitive defaults, respects `.gitignore` natively.
  Good alternative for `files`/`dirs` mode if you already use `fd`.

## Configuring backends

```toml
[backendSelection]
content = "rg"
files = "fd"
```

Or in TypeScript:

```ts
export default defineConfig({
  backendSelection: {
    content: "rg",
    files: "fd",
  },
})
```

Available backends per mode:

| Mode | Built-in | External |
|------|----------|----------|
| `files` | `fff` (default) | `fd` |
| `dirs` | `fff` (default) | `fd` |
| `content` | `fff` (default) | `rg` |
| `semantic` | `qmd` (default) | — |

If an external backend is not installed, findfile falls back to the
built-in backend automatically (with a stderr warning).

## Backend behavior differences

### ripgrep (`rg`)

- Uses `rg --json` for structured output
- Supports all `SearchFilters`: glob, ignore-case, word boundary, context
- Regex mode maps to `rg --regexp`
- Fuzzy mode maps to `rg --smart-case`
- Plain mode maps to `rg --fixed-strings`

### fd

- Uses `fd --type file` / `fd --type directory`
- Supports glob (`--glob`), max-depth (`--max-depth`), and time
  filters (`--changed-within`)
- Does **not** support fuzzy search; treated as substring match

## Custom shell backends

For tools not natively supported, use the shell backend system:

```toml
[[backends.custom]]
name = "ast-grep"
mode = "content"
command = "sg --pattern {query} --json=stream"
```

The command must emit JSONL where each line is:

```json
{ "relativePath": "src/app.ts", "match": { "line": 1, "col": 1, "preview": "..." } }
```

Tokens `{query}` and `{cwd}` are substituted before execution.

## Architecture

Backends implement a uniform contract (`BackendSearch`):

```ts
interface BackendSearch {
  readonly search: (q: SearchQuery) => Stream.Stream<SearchResult, SearchError>
  readonly supports: (mode: Mode) => boolean
}
```

`QueryRouter` reads `backendSelection` from config and routes each
query to the selected backend. Results from all active backends are
merged into a single stream.

Adding a new backend means:
1. Create `src/core/backends/<name>.ts`
2. Implement `BackendSearch`
3. Register in `QueryRouter` dependencies
4. Add to `AppLive` layer in `src/bin/findfile.ts`
