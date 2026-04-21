# Theming

findfile has a comprehensive token-based theme system. Every color, border, and spacing value in the TUI is configurable.

## Quick start

### Use a built-in preset (TOML)

```toml
[theme]
preset = "opencode"  # dark | light | opencode
```

### Use a built-in preset (TypeScript)

```ts
// findfile.config.ts
export default {
  theme: { preset: "opencode" },
}
```

### Full custom theme (TypeScript)

```ts
// findfile.config.ts
export default {
  themeObject: {
    name: "neon",
    primitives: {
      colors: {
        bg: "#050505",
        fg: "#00ff00",
        accent: "#ff00ff",
        border: "#333333",
        matchFg: "#ffff00",
        matchBg: "#444400",
      },
    },
    semantic: {
      results: {
        selectedBg: "#1a1a1a",
        matchFg: "#ffff00",
      },
    },
  },
}
```

---

## Token architecture

Three layers, each overriding the one above:

```
Component tokens  →  Semantic tokens  →  Primitive tokens  →  Hardcoded default
```

### 1. Primitive tokens

Raw building blocks — colors and spacing units.

```ts
primitives: {
  spacingUnit: 1,
  colors: {
    bg: "#0f172a",           // Deepest background
    fg: "#e2e8f0",           // Primary text
    fgMuted: "#94a3b8",      // Secondary text
    fgDim: "#64748b",        // Placeholders, hints
    accent: "#38bdf8",       // Active elements
    accentBg: "#0c4a6e",     // Selected item bg
    border: "#334155",       // Default border
    borderFocused: "#38bdf8",// Focus ring
    success: "#4ade80",
    warning: "#fbbf24",
    error: "#ef4444",
    matchFg: "#fbbf24",      // Match highlight text
    matchBg: "#78350f",      // Match highlight background
  }
}
```

### 2. Semantic tokens

What the color is **for**, not what color it is.

```ts
semantic: {
  app: { bg, fg },
  input: { bg, fg, placeholderFg, border, borderFocused, padding, height },
  results: { bg, fg, fgPath, selectedBg, selectedFg, matchFg, matchBg, border, padding },
  preview: { bg, fg, fgPath, border, padding },
  status: { bg, fg, fgMode, fgKey, height },
  scrollbar: { thumb, track, width },
}
```

### 3. Component tokens

Per-component overrides. Use these when one component needs to diverge from the semantic default.

```ts
components: {
  resultsList: { matchFg: "#ff00ff" },  // Only ResultsList gets pink matches
  previewPane: { border: "#ff0000" },   // Only PreviewPane gets red border
}
```

---

## Built-in presets

findfile ships **35 presets**, including all themes from [opencode](https://github.com/sst/opencode)'s TUI:

| Preset | Description |
|--------|-------------|
| `dark` | Default. Slate backgrounds, sky accent, amber matches. |
| `light` | Clean white background, blue accent. |
| `opencode` | Near-black, purple accent, minimal chrome. |
| `tokyonight` | Deep blue-purple, popular with Neovim users. |
| `dracula` | Classic purple-pink syntax colors on dark gray. |
| `catppuccin` | Soft pastel palette (macchiato, frappe, mocha variants). |
| `gruvbox` | Retro groove — warm browns and muted greens. |
| `nord` | Arctic blue-gray, inspired by Nordic winters. |
| `monokai` | High-contrast classic editor theme. |
| `solarized` | Precision-crafted light/dark pair by Ethan Schoonover. |
| `one-dark` | Atom's iconic dark theme. |
| `github` | Matches GitHub's code viewer. |
| `matrix` | Green-on-black terminal aesthetic. |
| `kanagawa` | Japanese-inspired dark theme with wave blues. |
| `rosepine` | Soft pine and rose hues. |
| `vesper` | Warm amber accent on near-black. |
| `zenburn` | Low-contrast, easy on the eyes. |
| `nightowl` | Deep navy with bright syntax pops. |
| `aura` | Dark with violet and cyan accents. |
| `everforest` | Nature-inspired muted greens. |
| `flexoki` | Ink-inspired minimal palette. |
| `cursor` | Matches Cursor editor's dark mode. |
| `cobalt2` | Bright blues on deep navy. |
| `carbonfox` | Firefox-themed dark grays. |
| `material` | Google's Material Design colors. |
| `palenight` | Soft purple-blue, inspired by Material Palenight. |
| `mercury` | Clean silver-gray minimalism. |
| `ayu` | Bright syntax on dark backgrounds. |
| `osaka-jade` | Japanese jade green accent. |
| `orng` / `lucent-orng` | Orange-forward warm themes. |
| `shadesofpurple` | Bold purple emphasis. |
| `synthwave84` | Neon retro-futurism. |
| `vercel` | Clean black-and-white minimalism. |

## Theme picker

Press `ctrl+t` in the TUI to open the theme picker. Navigate with `↑`/`↓` to preview themes live. Press `Enter` to confirm or `Esc` to cancel.

---

## Full token reference

### Primitives → colors

| Token | Default (dark) | Used for |
|-------|----------------|----------|
| `bg` | `#0f172a` | App background |
| `fg` | `#e2e8f0` | Primary text |
| `fgMuted` | `#94a3b8` | Secondary text |
| `fgDim` | `#64748b` | Placeholders, hints |
| `fgOnAccent` | `#0f172a` | Text on accent background |
| `accent` | `#38bdf8` | Active elements, mode indicator |
| `accentBg` | `#0c4a6e` | Selected item background |
| `accentBorder` | `#38bdf8` | Focus ring |
| `success` | `#4ade80` | Success states, marked indicator |
| `warning` | `#fbbf24` | Warnings |
| `error` | `#ef4444` | Errors |
| `info` | `#60a5fa` | Info |
| `border` | `#334155` | Default borders |
| `borderFocused` | `#38bdf8` | Border when focused |
| `borderActive` | `#7dd3fc` | Border when active |
| `surface` | `#1e293b` | Lifted surfaces (input bg) |
| `surfaceElevated` | `#334155` | Popups, dropdowns |
| `matchFg` | `#fbbf24` | Match highlight text |
| `matchBg` | `#78350f` | Match highlight background |
| `markedFg` | `#4ade80` | Marked item indicator |
| `scrollbarThumb` | `#334155` | Scrollbar thumb |
| `scrollbarTrack` | `#0f172a` | Scrollbar track |

### Semantic → app

| Token | Default | Used in |
|-------|---------|---------|
| `app.bg` | `#0f172a` | Root app background |
| `app.fg` | `#e2e8f0` | Root app foreground |

### Semantic → input

| Token | Default | Used in |
|-------|---------|---------|
| `input.bg` | `#1e293b` | QueryInput background |
| `input.fg` | `#e2e8f0` | QueryInput text |
| `input.placeholderFg` | `#475569` | Placeholder text |
| `input.border` | `#334155` | Border color |
| `input.borderFocused` | `#38bdf8` | Border when focused |
| `input.padding` | `1` | Horizontal padding |
| `input.height` | `3` | Box height |

### Semantic → results

| Token | Default | Used in |
|-------|---------|---------|
| `results.bg` | `#0f172a` | ResultsList background |
| `results.fg` | `#aaaaaa` | Normal row text |
| `results.fgPath` | `#64748b` | File path text |
| `results.fgLine` | `#38bdf8` | Line number |
| `results.fgPreview` | `#aaaaaa` | Preview snippet |
| `results.selectedBg` | `#334155` | Selected row background |
| `results.selectedFg` | `#ffffff` | Selected row text |
| `results.selectedFgPath` | `#94a3b8` | Selected row path |
| `results.markedFg` | `#4ade80` | Marked indicator |
| `results.markedIndicator` | `#4ade80` | Marked checkbox |
| `results.matchFg` | `#fbbf24` | Match highlight text |
| `results.matchBg` | `#78350f` | Match highlight background |
| `results.border` | `#334155` | Border color |
| `results.borderStyle` | `"single"` | Border style |
| `results.titleFg` | `#94a3b8` | Panel title |
| `results.padding` | `1` | Horizontal padding |

### Semantic → preview

| Token | Default | Used in |
|-------|---------|---------|
| `preview.bg` | `#0f172a` | PreviewPane background |
| `preview.fg` | `#e2e8f0` | Preview text |
| `preview.fgPath` | `#94a3b8` | File path header |
| `preview.border` | `#334155` | Border color |
| `preview.borderStyle` | `"single"` | Border style |
| `preview.titleFg` | `#94a3b8` | Panel title |
| `preview.padding` | `1` | Horizontal padding |
| `preview.errorFg` | `#ef4444` | Error text |
| `preview.emptyFg` | `#777777` | Empty state text |

### Semantic → status

| Token | Default | Used in |
|-------|---------|---------|
| `status.bg` | `#0f172a` | StatusBar background |
| `status.fg` | `#aaaaaa` | Status text |
| `status.fgMode` | `#38bdf8` | Mode label `[files]` |
| `status.fgKey` | `#666666` | Keybind hints |
| `status.fgCount` | `#94a3b8` | Result count |
| `status.height` | `1` | Bar height |

---

## TypeScript vs TOML

| Feature | TOML | TypeScript |
|---------|------|------------|
| Presets | `[theme]\npreset = "dark"` | `theme: { preset: "dark" }` |
| Full theme | Not supported | `themeObject: { ... }` |
| Type safety | None | Full autocomplete |
| Compose presets | No | Yes (`...themes.dark`) |
| Dynamic values | No | Yes |

TypeScript configs are loaded from `findfile.config.ts` (project) or `~/.config/findfile/config.ts` (user). They take precedence over `.toml` files.

---

## Source-level customization

For users who want to change layout structure, add new UI elements, or modify behavior:

1. **Clone the repository** (or install from source)
2. **Edit `src/tui/components/*.tsx`** — add panels, change layout, add new features
3. **Run with `bun run dev`**

The codebase is structured so that `src/core/**` is the library (search, config, backends) and `src/tui/**` is the UI layer. You can:

- Add new components in `src/tui/components/`
- Modify `src/tui/app.tsx` to change the overall layout
- Add new theme tokens in `src/tui/theme/tokens.ts`
- Create new theme presets in `src/tui/theme/presets.ts`

The theme system is designed to handle most visual customization without touching source code. But when you need to, the source is clean and modular.

---

## Inspiration from opencode

The `opencode` preset is directly inspired by [opencode](https://github.com/sst/opencode)'s TUI:

- **Near-black backgrounds** (`#0a0a0a`) for minimal eye strain
- **Purple accent** (`#a78bfa`) instead of blue — distinctive and calm
- **Very subtle borders** (`#262626`) — the UI recedes, content shines
- **Muted text hierarchy** — three clear levels: bright white for selected, gray for normal, dark gray for hints
- **No heavy chrome** — single-line borders, no shadows, no gradients

Key opencode patterns we adopted:
- Selection via `backgroundColor` + bold text (not inverse video)
- Inline styled spans for match highlighting (a differentiator — opencode doesn't do this)
- Syntax highlighting via `SyntaxStyle.fromTheme(...)` + `<code>` element
- Minimal status bar with mode indicator in accent color
