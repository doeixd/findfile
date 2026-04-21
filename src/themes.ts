/**
 * Built-in theme presets for findfile.
 *
 * Import in your findfile.config.ts:
 *
 * ```ts
 * import { themes } from "findfile/themes"
 *
 * export default defineConfig({
 *   theme: themes.dark,   // or themes.light, themes.opencode
 * })
 * ```
 */

export { darkTheme, lightTheme, opencodeTheme, themes, defaultTheme } from "./tui/theme/presets.ts"
export type { FindfileTheme } from "./tui/theme/tokens.ts"
