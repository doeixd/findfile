# How opencode does highlighting

Research notes from cloning `sst/opencode` and reading its TUI internals (`packages/opencode/src/cli/cmd/tui/`). Opencode runs on the same stack as findfile — `@opentui/core@0.1.101` + `@opentui/solid@0.1.101` — so everything here is directly portable.

There are **four distinct flavors of "highlighting"** in the opencode TUI, each using a different mechanism:

1. Syntax highlighting in code/markdown/diff blocks
2. Inline styled text fragments (the `<span>` / `<b>` pattern)
3. Selection / active-row highlighting
4. Fuzzy filter scoring (which, notably, has *no* visual highlight)

---

## 1. Syntax highlighting — `SyntaxStyle` + tree-sitter scopes

**Where:** `packages/opencode/src/cli/cmd/tui/context/theme.tsx`

`@opentui/core` ships a `SyntaxStyle` class that accepts a theme of `{ scope, style }` rules. Scopes are tree-sitter capture names (`comment`, `string`, `keyword.return`, etc.), and the style maps to foreground color + text attributes.

```ts
import { SyntaxStyle, RGBA } from "@opentui/core"

function getSyntaxRules(theme: Theme) {
  return [
    { scope: ["default"],                 style: { foreground: theme.text } },
    { scope: ["comment"],                 style: { foreground: theme.syntaxComment, italic: true } },
    { scope: ["string", "symbol"],        style: { foreground: theme.syntaxString } },
    { scope: ["number", "boolean"],       style: { foreground: theme.syntaxNumber } },
    { scope: ["keyword.return", "keyword.function", "keyword.control"],
                                          style: { foreground: theme.syntaxKeyword, italic: true } },
    { scope: ["keyword.type"],            style: { foreground: theme.syntaxType, bold: true } },
    // ...many more (operator, punctuation, variable, function, tag, attribute, …)
  ]
}

function generateSyntax(theme: Theme) {
  return SyntaxStyle.fromTheme(getSyntaxRules(theme))
}

// A dimmed variant used for "thinking" / background content.
function generateSubtleSyntax(theme: Theme) {
  // same rules, but foregrounds are blended toward the background via theme.thinkingOpacity
}
```

The `SyntaxStyle` object is produced once per theme and exposed from the Theme context as a Solid signal (`syntax()`, `subtleSyntax()`) so every consumer re-reads it on theme change.

### How it's consumed

**Where:** `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

`@opentui/solid` exposes three intrinsic JSX tags that accept a `syntaxStyle` prop and do all the parsing + coloring internally:

```tsx
<code
  filetype={filetype(props.input.filePath!)}
  syntaxStyle={syntax()}
  content={code()}
  conceal={false}
  fg={theme.text}
/>

<markdown
  syntaxStyle={syntax()}
  streaming={true}
  content={message}
/>

<diff
  filetype={ft()}
  syntaxStyle={syntax()}
  showLineNumbers={true}
/>
```

A small `filetype()` helper maps file extensions to the language names the tree-sitter loader expects, with a few aliases:

```ts
function filetype(input?: string) {
  if (!input) return "none"
  const ext = path.extname(input)
  const language = LANGUAGE_EXTENSIONS[ext]
  if (["typescriptreact", "javascriptreact", "javascript"].includes(language)) return "typescript"
  return language
}
```

**Bottom line:** opencode doesn't parse code itself. It hands a filetype + a `SyntaxStyle` theme to opentui's `<code>` / `<markdown>` / `<diff>` elements and lets opentui run tree-sitter and apply the scope→color mapping.

---

## 2. Inline styled text — `<span style>` and `<b>` fragments

**Where:** `packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`, `component/dialog-session-list.tsx`

For everything that isn't a code block — list rows, footer badges, keybind hints — opencode uses Solid JSX inline inside `<text>` elements:

```tsx
<text>
  <span style={{ fg: theme.text }}>
    <b>{item.title}</b>{" "}
  </span>
  <span style={{ fg: theme.textMuted }}>{item.category}</span>
</text>
```

Indicator dots get their color inline too:

```tsx
<span style={{ fg: workspaceStatus === "connected" ? theme.success : theme.error }}>●</span>
```

Key properties:

- `<span style={{ fg, bg }}>` sets foreground/background for a run of text.
- `<b>`, `<em>` etc. are thin wrappers that set text attributes.
- `{" "}` literal spacing works the same as in React — the runtime treats each child as a styled text run and concatenates them.

This is the opencode answer to "how do I put two colors on the same line" and it's what findfile should use for anything short of a full code block.

---

## 3. Selection / active-row highlighting

**Where:** `packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`

The selected row in a list changes its background color and bolds its text. No inverse-video trick — just direct props:

```tsx
<box
  backgroundColor={active() ? (option.bg ?? theme.primary) : RGBA.fromInts(0, 0, 0, 0)}
>
  <text attributes={props.active ? TextAttributes.BOLD : undefined}>
    {option.title}
  </text>
</box>
```

- **`backgroundColor`** on a `<box>` paints the whole row width.
- **`RGBA.fromInts(0, 0, 0, 0)`** is the "no background" sentinel (fully transparent alpha).
- **`attributes={TextAttributes.BOLD}`** — opentui exposes bitflag attributes (`BOLD | UNDERLINE | ITALIC | DIM`). Combine with `|`.
- The `option.bg` override lets a row signal its own background (opencode uses it for "pending-delete" rows that go red).

---

## 4. Fuzzy filtering — scored, not highlighted

**Where:** `packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`

Opencode uses `fuzzysort` for interactive filtering:

```ts
import fuzzysort from "fuzzysort"

const matches = fuzzysort.go(needle, options, {
  keys: ["title", "category"],
  scoreFn: (r) => /* weighted combination across keys */,
})
```

**But there is no per-character match highlighting.** fuzzysort can return match indices (via `result.indexes` or `.highlight()`), and opencode simply doesn't use them. Matched items are just reordered — the text itself renders identically whether a character matched or not.

This is a real gap, and one findfile can beat opencode on: we already get `match.ranges` (column spans) back from `fff-grep`, so we can render a line as

```tsx
<text>
  <span>{prefix}</span>
  <span style={{ fg: theme.accent, bg: theme.accentDim }}>{matched}</span>
  <span>{suffix}</span>
</text>
```

…and get actual inline match highlighting that opencode doesn't have.

---

## Summary table

| Need                          | Mechanism                                    | File                                    |
| ----------------------------- | -------------------------------------------- | --------------------------------------- |
| Color a code block by syntax  | `<code syntaxStyle={syntax()} filetype=…>`   | `routes/session/index.tsx`              |
| Build the `SyntaxStyle`       | `SyntaxStyle.fromTheme(rules)`               | `context/theme.tsx`                     |
| Color a run of text inline    | `<span style={{ fg, bg }}>`, `<b>`, `<em>`   | `ui/dialog-select.tsx`                  |
| Highlight the selected row    | `backgroundColor` on `<box>` + `TextAttributes.BOLD` | `ui/dialog-select.tsx`          |
| Fuzzy filter (score only)     | `fuzzysort.go(needle, opts, { keys, … })`    | `ui/dialog-select.tsx`                  |
| Show match ranges inline      | **Not implemented in opencode**              | —                                       |

## What findfile should take from this

1. **Preview pane syntax highlighting** is essentially free: add a `Theme` context that exposes `syntax()` via `SyntaxStyle.fromTheme(...)`, and render the preview as `<code filetype={ext→lang} syntaxStyle={syntax()} content={preview.text} />` instead of plain `<text>`. A filetype map of ~20 common extensions covers most files.
2. **Results list styling** should move to the `<span style>` / `<b>` pattern so we can dim paths, color the filename, and bold the selected row — matching opencode's visual language.
3. **Match-range highlighting** is a differentiator. Plumb `match.ranges` from fff-grep through `SearchResult` into the results row renderer and paint those columns with a highlight background. Opencode doesn't do this and it's one of the most useful things a grep-style tool can show.
4. Keep the selection pattern (`backgroundColor` + `TextAttributes.BOLD`) — it's the idiomatic opentui way.
