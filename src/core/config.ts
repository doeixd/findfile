import { Effect, Option, Schema } from "effect"
import { FileSystem } from "@effect/platform"
import path from "node:path"
import os from "node:os"
import { parse as parseToml, TomlError } from "smol-toml"
import { ConfigLoadError, ConfigValidationError } from "./errors.ts"
import { GrepMode, Mode, ModeDefaults } from "./schema.ts"
import type { FindfileTheme } from "#tui/theme/tokens.ts"
import { themes } from "#tui/theme/presets.ts"

export const SavedQuery = Schema.Struct({
  text: Schema.optional(Schema.String),
  mode: Schema.optional(Mode),
  grepMode: Schema.optional(GrepMode),
  globs: Schema.optional(Schema.Array(Schema.String)),
  types: Schema.optional(Schema.Array(Schema.String)),
  modifiedSince: Schema.optional(Schema.String),
})
export type SavedQuery = typeof SavedQuery.Type

/**
 * User-facing config schema. Every field is optional — unspecified keys
 * fall back to the compile-time defaults in {@link defaultConfig}.
 */
export const SubmitActionName = Schema.Literal("print", "open", "copy", "navigate", "custom")

export const FindfileConfig = Schema.Struct({
  defaultMode: Schema.optional(Mode),
  layout: Schema.optional(
    Schema.Struct({
      weights: Schema.Tuple(Schema.Int, Schema.Int),
      paddingTop: Schema.optional(Schema.Int),
      paddingRight: Schema.optional(Schema.Int),
      paddingBottom: Schema.optional(Schema.Int),
      paddingLeft: Schema.optional(Schema.Int),
      showPreview: Schema.optional(Schema.Boolean),
      previewWeight: Schema.optional(Schema.Number),
      showBreadcrumbs: Schema.optional(Schema.Boolean),
      showStatusBar: Schema.optional(Schema.Boolean),
      showScrollbars: Schema.optional(Schema.Boolean),
    }),
  ),
  keymap: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  qmd: Schema.optional(
    Schema.Struct({
      autoIndex: Schema.optional(Schema.Boolean),
      modelsDir: Schema.optional(Schema.String),
    }),
  ),
  ignore: Schema.optional(
    Schema.Struct({
      extra: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  theme: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  queries: Schema.optional(Schema.Record({ key: Schema.String, value: SavedQuery })),
  backends: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        mode: Mode,
        command: Schema.String,
      }),
    }),
  ),
  modeDefaults: Schema.optional(Schema.Record({ key: Mode, value: ModeDefaults })),
  /** Backend selection per mode: "fff", "rg", "fd", "zoxide", etc. */
  backendSelection: Schema.optional(Schema.Record({ key: Mode, value: Schema.String })),
  /** Default submit action when user presses Enter in the TUI */
  defaultAction: Schema.optional(SubmitActionName),
  /** Custom shell command for the "custom" submit action. {path} is replaced. */
  openCmd: Schema.optional(Schema.String),
})
export type FindfileConfig = typeof FindfileConfig.Type

/** Fully-resolved config: defaults merged with every override layer. */
export interface BackendConfig {
  readonly mode: Mode
  readonly command: string
}

export interface ResolvedConfig {
  readonly defaultMode: Mode
  readonly layout: {
    readonly weights: readonly [number, number]
    readonly paddingTop: number
    readonly paddingRight: number
    readonly paddingBottom: number
    readonly paddingLeft: number
    readonly showPreview: boolean
    readonly previewWeight: number
    readonly showBreadcrumbs: boolean
    readonly showStatusBar: boolean
    readonly showScrollbars: boolean
  }
  readonly keymap: Readonly<Record<string, unknown>>
  readonly qmd: { readonly autoIndex: boolean; readonly modelsDir: string | null }
  readonly ignore: { readonly extra: readonly string[] }
  readonly theme: Readonly<Record<string, string>>
  readonly queries: Readonly<Record<string, SavedQuery>>
  readonly backends: Readonly<Record<string, BackendConfig>>
  readonly modeDefaults: Readonly<Record<string, ModeDefaults>>
  readonly backendSelection: Readonly<Record<string, string>>
  /** Full theme object when loaded from TypeScript config */
  readonly themeObject: FindfileTheme | null
  readonly defaultAction: "print" | "open" | "copy" | "navigate" | "custom"
  readonly openCmd: string | null
}

const defaultConfig: ResolvedConfig = {
  defaultMode: "files",
  layout: { weights: [2, 3], paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, showPreview: true, previewWeight: 0.4, showBreadcrumbs: true, showStatusBar: true, showScrollbars: true },
  keymap: {},
  qmd: { autoIndex: true, modelsDir: null },
  ignore: { extra: [] },
  theme: {},
  queries: {},
  backends: {},
  modeDefaults: {},
  backendSelection: {},
  themeObject: null,
  defaultAction: "print",
  openCmd: null,
}

const userConfigToml = (): string =>
  path.join(os.homedir(), ".config", "findfile", "config.toml")

const userConfigTs = (): string =>
  path.join(os.homedir(), ".config", "findfile", "config.ts")

const projectConfigToml = (cwd: string): string =>
  path.join(cwd, "findfile.config.toml")

const projectConfigTs = (cwd: string): string =>
  path.join(cwd, "findfile.config.ts")

const makeReadOptional =
  (fs: FileSystem.FileSystem) =>
  (filePath: string): Effect.Effect<Option.Option<string>, ConfigLoadError> =>
    Effect.gen(function* () {
      const present = yield* fs.exists(filePath).pipe(
        Effect.mapError(
          (e) => new ConfigLoadError({ path: filePath, message: String(e) }),
        ),
      )
      if (!present) return Option.none()
      const body = yield* fs.readFileString(filePath).pipe(
        Effect.mapError(
          (e) => new ConfigLoadError({ path: filePath, message: String(e) }),
        ),
      )
      return Option.some(body)
    })

const decode = (
  filePath: string,
  raw: string,
): Effect.Effect<FindfileConfig, ConfigLoadError | ConfigValidationError> =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => parseToml(raw),
      catch: (e) =>
        new ConfigLoadError({
          path: filePath,
          message: e instanceof TomlError ? e.message : String(e),
        }),
    })
    return yield* Schema.decodeUnknown(FindfileConfig)(parsed).pipe(
      Effect.mapError(
        (err) =>
          new ConfigValidationError({
            path: filePath,
            issues: err.message ?? String(err),
          }),
      ),
    )
  })

const resolvePreset = (themeConfig: Record<string, unknown> | undefined): FindfileTheme | undefined => {
  if (!themeConfig) return undefined
  const preset = themeConfig.preset
  if (typeof preset === "string" && preset in themes) {
    return themes[preset]
  }
  return undefined
}

const merge = (base: ResolvedConfig, over: FindfileConfig & { themeObject?: FindfileTheme }): ResolvedConfig => {
  const presetTheme = resolvePreset(over.theme as Record<string, unknown> | undefined)
  return {
    defaultMode: over.defaultMode ?? base.defaultMode,
    layout: over.layout
      ? {
          weights: over.layout.weights,
          paddingTop: over.layout.paddingTop ?? base.layout.paddingTop,
          paddingRight: over.layout.paddingRight ?? base.layout.paddingRight,
          paddingBottom: over.layout.paddingBottom ?? base.layout.paddingBottom,
          paddingLeft: over.layout.paddingLeft ?? base.layout.paddingLeft,
          showPreview: over.layout.showPreview ?? base.layout.showPreview,
          previewWeight: over.layout.previewWeight ?? base.layout.previewWeight,
          showBreadcrumbs: over.layout.showBreadcrumbs ?? base.layout.showBreadcrumbs,
          showStatusBar: over.layout.showStatusBar ?? base.layout.showStatusBar,
          showScrollbars: over.layout.showScrollbars ?? base.layout.showScrollbars,
        }
      : base.layout,
    keymap: over.keymap ? { ...base.keymap, ...over.keymap } : base.keymap,
    qmd: {
      autoIndex: over.qmd?.autoIndex ?? base.qmd.autoIndex,
      modelsDir: over.qmd?.modelsDir ?? base.qmd.modelsDir,
    },
    ignore: {
      extra: over.ignore?.extra
        ? [...base.ignore.extra, ...over.ignore.extra]
        : base.ignore.extra,
    },
    theme: over.theme
      ? (Object.fromEntries(
          Object.entries(over.theme).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>)
      : base.theme,
    queries: over.queries ? { ...base.queries, ...over.queries } : base.queries,
    backends: over.backends ? { ...base.backends, ...over.backends } : base.backends,
    modeDefaults: over.modeDefaults ? { ...base.modeDefaults, ...over.modeDefaults } : base.modeDefaults,
    backendSelection: over.backendSelection ? { ...base.backendSelection, ...over.backendSelection } : base.backendSelection,
    themeObject: over.themeObject ?? presetTheme ?? base.themeObject,
    defaultAction: over.defaultAction ?? base.defaultAction,
    openCmd: over.openCmd ?? base.openCmd,
  }
}

export interface CliOverrides {
  readonly defaultMode?: Mode
  readonly extraIgnore?: readonly string[]
  /** Explicit config file path (highest precedence) */
  readonly configPath?: string
}

export interface ConfigSource {
  readonly path: string
  readonly exists: boolean
  readonly config?: FindfileConfig
}

export interface ConfigLoadResult {
  readonly sources: readonly ConfigSource[]
  readonly resolved: ResolvedConfig
}

/**
 * Helper for TypeScript config files. Provides type inference and
 * autocomplete in findfile.config.ts.
 */
export const defineConfig = (config: FindfileConfig & { themeObject?: FindfileTheme }): FindfileConfig & { themeObject?: FindfileTheme } => config

/**
 * Returns mode defaults for the given mode, or `undefined` if none
 * are configured.
 */
export const getModeDefaults = (
  config: ResolvedConfig,
  mode: Mode,
): ModeDefaults | undefined => config.modeDefaults[mode]

/**
 * Loads config with precedence low→high:
 *   built-in defaults
 *   → ~/.config/findfile/config.toml
 *   → ./findfile.config.toml (project-local)
 *   → CLI overrides
 *
 * Missing files are silently skipped; malformed files fail loudly via
 * {@link ConfigLoadError} / {@link ConfigValidationError}.
 */
export class ConfigService extends Effect.Service<ConfigService>()("findfile/ConfigService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const readOptional = makeReadOptional(fs)

    const loadTsConfig = (filePath: string): Effect.Effect<FindfileConfig & { themeObject?: FindfileTheme }, ConfigLoadError> =>
      Effect.gen(function* () {
        const mod = yield* Effect.tryPromise({
          try: () => import(filePath) as Promise<{ default?: unknown }>,
          catch: (e) =>
            new ConfigLoadError({
              path: filePath,
              message: `failed to import TS config: ${String(e)}`,
            }),
        })
        const exported = mod.default
        if (exported === undefined || typeof exported !== "object" || exported === null) {
          return yield* Effect.fail(
            new ConfigLoadError({
              path: filePath,
              message: "config.ts must export a default object",
            }),
          )
        }
        const cfg = exported as Record<string, unknown>
        // Extract themeObject if present, keep the rest as FindfileConfig
        const themeObject = cfg.themeObject as FindfileTheme | undefined
        const { themeObject: _, ...rest } = cfg
        return { ...rest, themeObject } as FindfileConfig & { themeObject?: FindfileTheme }
      })

    const load = Effect.fn("ConfigService.load")(function* (
      cwd: string,
      overrides: CliOverrides = {},
    ) {
      const userToml = userConfigToml()
      const userTs = userConfigTs()
      const projToml = projectConfigToml(cwd)
      const projTs = projectConfigTs(cwd)

      const sources: ConfigSource[] = [
        { path: "(built-in defaults)", exists: true },
      ]

      let resolved = defaultConfig

      // User config: prefer .ts over .toml
      const userTsExists = yield* fs.exists(userTs).pipe(Effect.orElseSucceed(() => false))
      if (userTsExists) {
        const user = yield* loadTsConfig(userTs)
        resolved = merge(resolved, user)
        sources.push({ path: userTs, exists: true })
      } else {
        const userRaw = yield* readOptional(userToml)
        if (Option.isSome(userRaw)) {
          const user = yield* decode(userToml, userRaw.value)
          resolved = merge(resolved, user)
          sources.push({ path: userToml, exists: true, config: user })
        } else {
          sources.push({ path: userToml, exists: false })
        }
      }

      // Project config: prefer .ts over .toml
      const projTsExists = yield* fs.exists(projTs).pipe(Effect.orElseSucceed(() => false))
      if (projTsExists) {
        const proj = yield* loadTsConfig(projTs)
        resolved = merge(resolved, proj)
        sources.push({ path: projTs, exists: true })
      } else {
        const projRaw = yield* readOptional(projToml)
        if (Option.isSome(projRaw)) {
          const proj = yield* decode(projToml, projRaw.value)
          resolved = merge(resolved, proj)
          sources.push({ path: projToml, exists: true, config: proj })
        } else {
          sources.push({ path: projToml, exists: false })
        }
      }

      // Explicit --config override (highest precedence before CLI flags)
      if (overrides.configPath !== undefined) {
        const cp = overrides.configPath
        if (cp.endsWith(".ts")) {
          const cfg = yield* loadTsConfig(cp)
          resolved = merge(resolved, cfg)
          sources.push({ path: cp, exists: true })
        } else {
          const raw = yield* readOptional(cp)
          if (Option.isSome(raw)) {
            const cfg = yield* decode(cp, raw.value)
            resolved = merge(resolved, cfg)
            sources.push({ path: cp, exists: true, config: cfg })
          } else {
            sources.push({ path: cp, exists: false })
          }
        }
      }

      if (overrides.defaultMode !== undefined) {
        resolved = { ...resolved, defaultMode: overrides.defaultMode }
      }
      if (overrides.extraIgnore && overrides.extraIgnore.length > 0) {
        resolved = {
          ...resolved,
          ignore: {
            extra: [...resolved.ignore.extra, ...overrides.extraIgnore],
          },
        }
      }

      return { sources, resolved } as ConfigLoadResult
    })

    return { load, defaults: defaultConfig }
  }),
}) {}
