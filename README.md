# findfile

Fast, beautiful TUI file finder with semantic search, 35 themes, and
first-class shell integration.

Built on [Bun](https://bun.sh), [Effect-TS](https://effect.website),
[`@ff-labs/fff-bun`](https://github.com/ff-labs/fff-bun), and
[`@opentui/solid`](https://github.com/opentui/opentui).

---

## Install

```bash
bun install -g findfile
```

Or run without installing:

```bash
bunx findfile
```

Requires Bun ≥ 1.0.

---

## Quick start

```bash
# Interactive TUI (default)
findfile

# Search file contents
findfile --mode content useState

# Search directories only
findfile --mode dirs src/

# Semantic search in markdown (requires qmd)
findfile --mode semantic "auth flow"

# Pipe-friendly output (auto-detected)
findfile app | head -5
findfile --mode content TODO | xargs -o nvim
```

---

## TUI

```
┌─────────────────────────────────────────┐
│[files] search…                          │
├──────────────┬──────────────────────────┤
│▶ src/app.tsx │ src/app.tsx               │
│  src/lib.ts  │ 1  import { createSignal }│
│  package.json│ 2  from "solid-js"        │
│              │ 3                         │
│              │ 4  export const App = () =>│
│              │                           │
├──────────────┴──────────────────────────┤
│[files] 3 results · C-t:mode · Enter:open │
└─────────────────────────────────────────┘
```

### Keys

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate results |
| `Ctrl+P` / `Ctrl+N` | Navigate results |
| `PgUp` / `PgDn` | Page up/down |
| `Tab` / `Shift+Tab` | Cycle search mode |
| `Space` | Mark/unmark row (multi-select) |
| `Enter` | Open selected (or all marked) |
| `Ctrl+T` | Theme picker |
| `?` | Help overlay |
| `Esc` / `Ctrl+C` | Quit |
| `Ctrl+↑` / `Ctrl+↓` | Query history |

### Modes

- **files** — Fuzzy find by filename
- **dirs** — Fuzzy find directories
- **content** — Grep file contents
- **semantic** — Natural language search in markdown (via qmd)

---

## Themes

35 built-in presets including Tokyo Night, Dracula, Catppuccin,
Gruvbox, Nord, Monokai, Solarized, and more.

```bash
# In the TUI, press Ctrl+T to browse themes live
```

Or set in config:

```toml
[theme]
preset = "tokyonight"
```

---

## Backends

Swap the search engine per mode:

```toml
[backendSelection]
content = "rg"   # ripgrep for content search
files = "fd"     # fd for file search
```

- **fff** (default) — Bundled Rust backend, zero external deps
- **rg** — ripgrep with PCRE2 regex, multiline search
- **fd** — Fast directory/file finder

See [`docs/backends.md`](docs/backends.md) for full details.

---

## Shell integration

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# Pick files, open in $EDITOR
ff() {
  local out
  out=$(findfile "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    ${EDITOR:-vim} "$line"
  done <<< "$out"
}

# Grep then edit
ffg() {
  local out
  out=$(findfile --mode content "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    ${EDITOR:-vim} "$line"
  done <<< "$out"
}
```

See [`docs/shell-integration.md`](docs/shell-integration.md) for
fish, Neovim, VS Code, and Emacs variants.

---

## Configuration

### TOML (`findfile.config.toml`)

```toml
[theme]
preset = "dracula"

[modeDefaults.content]
caseInsensitive = true
beforeContext = 3
afterContext = 3

[keymap]
"ctrl+o" = "submit"

[queries.todos]
text = "TODO|FIXME"
mode = "content"
grepMode = "regex"
```

### TypeScript (`findfile.config.ts`)

Type-safe with autocomplete:

```ts
import { defineConfig } from "findfile/config"

export default defineConfig({
  theme: { preset: "tokyonight" },
  keymap: {
    "ctrl+o": "submit",
    "ctrl+j": { command: "moveCursor", args: { direction: "down" } },
  },
  modeDefaults: {
    content: {
      caseInsensitive: true,
      beforeContext: 3,
      afterContext: 3,
    },
  },
})
```

Config precedence (low → high):
1. Built-in defaults
2. `~/.config/findfile/config.toml` (or `.ts`)
3. `./findfile.config.toml` (or `.ts`)
4. `--config <path>`
5. CLI flags

---

## CLI reference

```bash
findfile [query] [options]

Options:
  --mode <files|dirs|content|semantic>  Search mode
  --cwd <path>                          Search directory (default: .)
  --no-tui                              Plain output, no TUI
  --format <path|line|json|null>        Output format
  --color <always|auto|never>           ANSI colors
  --glob <pattern>                      Filter by glob (repeatable)
  --type <ext>                          Filter by type (repeatable)
  --hidden                              Include dotfiles
  --no-gitignore                        Disable .gitignore
  --depth <N>                           Max directory depth
  --modified-since <2d|2026-04-01>      Time filter
  -i, --ignore-case                     Case-insensitive
  -w, --word                           Word boundary
  -C, --context <N>                     Context lines
  --paths-from <file>                   Read paths from file (- for stdin)
  --preview-cmd <cmd>                   Custom preview command
  --limit <N>                           Max results
  --config <path>                       Config file
  --grep-mode <plain|regex|fuzzy>       Grep mode

Subcommands:
  doctor           Health check
  config print     Show effective config
  config path      List config file paths
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | At least one result found |
| 1 | No results |
| 2 | Error |

---

## Advanced

### Custom preview command

```bash
ff --preview-cmd 'bat --color=always {} -r :{line}'
```

### Pipe workflows

```bash
# Search only git-tracked files
git ls-files | findfile --paths-from - --mode content "TODO"

# Search recently modified markdown
findfile --type md --modified-since 7d "API"

# JSON output for scripting
findfile --format json --no-tui "schema" | jq '.match.preview'
```

### Saved queries

Invoke with `:` prefix:

```bash
findfile :todos
```

---

## Development

```bash
# Install dependencies
bun install

# Run in dev mode
bun run dev

# Run tests
bun test

# Type check
bun run typecheck

# Build binaries for all platforms
bun run build
```

---

## Architecture

- **`src/core/`** — Library layer (search, config, backends, filters)
- **`src/tui/`** — Solid JSX UI components
- **`src/bin/`** — CLI entry point

No file in `src/core/` imports from `src/tui/` or `@opentui/*`.

---

## License

MIT
