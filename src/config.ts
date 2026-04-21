/**
 * Public API for findfile configuration files.
 *
 * Import from "findfile/config" in your findfile.config.ts:
 *
 * ```ts
 * import { defineConfig } from "findfile/config"
 * import { themes } from "findfile/themes"
 *
 * export default defineConfig({
 *   theme: themes.dark,
 *   defaultMode: "files",
 *   // ...
 * })
 * ```
 */

export { defineConfig } from "./core/config.ts"
