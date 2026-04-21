# Commands & Keymaps

findfile's TUI is fully driven by a typed command system. Every keyboard action maps to a command, and every command is configurable via `keymap` in your config file.

## Quick example

```ts
// findfile.config.ts
export default {
  keymap: {
    // Simple command
    "ctrl+q": "quit",

    // Command with arguments
    "ctrl+j": { command: "moveCursor", args: { direction: "down" } },
    "ctrl+d": { command: "moveCursor", args: { direction: "pagedown", count: 1 } },

    // Multiple commands on one key
    "ctrl+a": ["markAll", "submit"],

    // Override a default
    "tab": { command: "setMode", args: { mode: "content" } },
  },
}
```

## Command reference

| Command | Args | Description |
|---------|------|-------------|
| `quit` | — | Exit findfile |
| `submit` | — | Submit selection (marked or current) |
| `moveCursor` | `{ direction, count? }` | Navigate results (up/down/page/first/last) |
| `toggleMark` | — | Mark/unmark current row |
| `markAll` | — | Mark all visible results |
| `unmarkAll` | — | Clear all marks |
| `invertMarks` | — | Invert mark state everywhere |
| `cycleMode` | — | Cycle to next search mode |
| `cycleModeReverse` | — | Cycle to previous search mode |
| `setMode` | `{ mode }` | Jump to specific mode |
| `clearQuery` | — | Clear input field |
| `scrollPreview` | `{ direction, lines? }` | Scroll preview pane |
| `toggleHelp` | — | Show/hide help overlay |
| `toggleThemePicker` | — | Show/hide theme picker |

### `moveCursor` directions

- `"up"` — Move up one row
- `"down"` — Move down one row
- `"pageup"` — Move up one page (10 rows)
- `"pagedown"` — Move down one page (10 rows)
- `"first"` — Jump to first result
- `"last"` — Jump to last result

The `count` arg multiplies the movement (default: 1).

### `setMode` modes

- `"files"` — File name search
- `"dirs"` — Directory search
- `"content"` — Content grep
- `"semantic"` — Semantic search (requires qmd)

## Key chord format

Key chords use modifier prefixes separated by `+`:

| Prefix | Meaning |
|--------|---------|
| `ctrl+` | Control key |
| `alt+` / `option+` | Option/Alt |
| `shift+` | Shift |
| `meta+` / `cmd+` / `win+` | Command / Windows key |

Examples: `"ctrl+n"`, `"alt+f4"`, `"shift+tab"`, `"cmd+o"`

Special key names: `escape`, `return`/`enter`, `space`, `tab`, `backspace`, `delete`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`, `f1`–`f12`.

## Default keymap

```ts
{
  escape: "quit",
  "ctrl+c": "quit",

  down: { command: "moveCursor", args: { direction: "down" } },
  up: { command: "moveCursor", args: { direction: "up" } },
  "ctrl+n": { command: "moveCursor", args: { direction: "down" } },
  "ctrl+p": { command: "moveCursor", args: { direction: "up" } },
  pagedown: { command: "moveCursor", args: { direction: "pagedown" } },
  pageup: { command: "moveCursor", args: { direction: "pageup" } },
  home: { command: "moveCursor", args: { direction: "first" } },
  end: { command: "moveCursor", args: { direction: "last" } },

  tab: "cycleMode",
  "shift+tab": "cycleModeReverse",

  space: "toggleMark",
  "ctrl+a": "markAll",
  "ctrl+u": "unmarkAll",
  "ctrl+i": "invertMarks",

  return: "submit",
  enter: "submit",

  "ctrl+l": "clearQuery",
  "?": "toggleHelp",
  "ctrl+t": "toggleThemePicker",
}
```

User keymap entries override defaults. Unspecified keys fall back to the default.

## Type-safe configuration

When using TypeScript config (`findfile.config.ts`), you get full autocomplete for command names and argument types:

```ts
export default {
  keymap: {
    // Autocomplete suggests: quit, submit, moveCursor, toggleMark, ...
    "ctrl+j": { command: "moveCursor", args: { direction: "down" } },

    // Type error if you typo a command name
    // "ctrl+x": "quuit", // ❌ Type error: "quuit" is not a valid command

    // Type error if args are wrong
    // "ctrl+m": { command: "moveCursor", args: { direction: "sideways" } },
    // ❌ Type error: "sideways" is not assignable to Direction
  },
}
```

## Status bar hints

The status bar automatically shows the keys bound to common commands. If you remap a command, the status bar updates to show your custom key:

```ts
keymap: {
  "ctrl+o": "submit",  // Status bar will show "C-o:open" instead of "Enter:open"
}
```

## Multiple commands per key

Bind multiple commands to a single keypress:

```ts
keymap: {
  // Mark all and immediately submit
  "ctrl+shift+a": ["markAll", "submit"],

  // Clear query and switch to files mode
  "ctrl+f": ["clearQuery", { command: "setMode", args: { mode: "files" } }],
}
```

## TOML keymaps (simple bindings only)

TOML configs support string-only bindings (no args, no arrays):

```toml
[keymap]
"ctrl+q" = "quit"
"ctrl+j" = "moveCursor"
"space" = "toggleMark"
```

For command arguments and arrays, use TypeScript config.

---

## Source-level customization

If the built-in commands aren't enough, you can edit `src/tui/commands.ts` to add new commands:

1. Add the command name to `CommandRegistry`
2. Add its argument type (or `undefined` if no args)
3. Implement the handler in `commandHandlers`
4. Use it in your keymap config

Example — adding a "copyPath" command:

```ts
// src/tui/commands.ts
export interface CommandRegistry {
  // ... existing commands
  copyPath: { args: undefined }
}

export const commandHandlers = {
  // ... existing handlers
  copyPath: (ctx) => {
    const r = ctx.selectedResult()
    if (r) {
      navigator.clipboard?.writeText(r.path)
    }
  },
}
```

```ts
// findfile.config.ts
export default {
  keymap: {
    "ctrl+y": "copyPath",
  },
}
```

The command system is intentionally simple — a registry of typed names + handlers. This makes it easy to extend without touching the component tree.
