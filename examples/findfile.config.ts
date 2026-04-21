/**
 * TypeScript config for findfile.
 *
 * Place this file as findfile.config.ts in your project root.
 * It takes precedence over findfile.config.toml.
 *
 * Benefits over TOML:
 * - Import and compose theme presets
 * - Full type safety and autocomplete
 * - Use JavaScript logic for dynamic values
 * - Access to the complete theme token system
 * - Typed keymaps with command arguments
 */

// If findfile is installed as a local dependency, you can import helpers:
// import { defineConfig, themes } from "findfile"

export default {
  // ===== Theme =====
  // Option 1: Use a preset name (dark, light, opencode)
  theme: { preset: "opencode" },

  // Option 2: Full custom theme object (uncomment to use)
  // themeObject: {
  //   name: "my-theme",
  //   primitives: {
  //     spacingUnit: 1,
  //     colors: {
  //       bg: "#0a0a0a",
  //       fg: "#e5e5e5",
  //       accent: "#a78bfa",
  //       border: "#262626",
  //       matchFg: "#facc15",
  //       matchBg: "#422006",
  //     },
  //   },
  //   semantic: {
  //     results: {
  //       selectedBg: "#262626",
  //       matchFg: "#facc15",
  //       matchBg: "#422006",
  //     },
  //   },
  // },

  // ===== Behavior =====
  defaultMode: "files",

  layout: {
    weights: [2, 3],
  },

  // ===== Keymap =====
  // Override or add keyboard shortcuts. Values can be:
  // - A command name (string): "quit"
  // - An object with args: { command: "moveCursor", args: { direction: "down", count: 5 } }
  // - An array for multiple commands: ["markAll", "submit"]
  //
  // Available commands:
  //   quit, submit, moveCursor, toggleMark, markAll, unmarkAll,
  //   invertMarks, cycleMode, cycleModeReverse, setMode, clearQuery,
  //   scrollPreview, toggleHelp
  //
  // moveCursor args: { direction: "up"|"down"|"pageup"|"pagedown"|"first"|"last", count?: number }
  // setMode args: { mode: "files"|"dirs"|"content"|"semantic" }
  // scrollPreview args: { direction: "up"|"down", lines?: number }
  keymap: {
    // Vim-style navigation
    "ctrl+j": { command: "moveCursor", args: { direction: "down" } },
    "ctrl+k": { command: "moveCursor", args: { direction: "up" } },
    "ctrl+d": { command: "moveCursor", args: { direction: "pagedown" } },
    "ctrl+u": { command: "moveCursor", args: { direction: "pageup" } },

    // Custom shortcuts
    "ctrl+q": "quit",
    "ctrl+o": "submit",
    "ctrl+m": "toggleMark",
    "ctrl+a": "markAll",
    "ctrl+x": "clearQuery",
  },

  // ===== Saved queries =====
  // Invoke with `findfile :todos`
  queries: {
    todos: {
      text: "TODO|FIXME",
      mode: "content",
      grepMode: "regex",
    },
    "recent-md": {
      mode: "files",
      globs: ["*.md"],
      modifiedSince: "7d",
    },
  },

  // ===== Custom backends =====
  backends: {
    "ast-grep": {
      mode: "content",
      command: "sg --pattern {query} --json=stream",
    },
  },

  // ===== Extra ignores =====
  ignore: {
    extra: ["dist/**", "*.log"],
  },
}
