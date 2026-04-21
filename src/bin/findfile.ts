#!/usr/bin/env bun
import { Args, Command, Options } from "@effect/cli"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { Effect, Layer, Option, Ref, Stream } from "effect"
import { FileSystem } from "@effect/platform"
import path from "node:path"
import os from "node:os"
import { ConfigService, type ConfigLoadResult, getModeDefaults } from "#core/config.ts"
import { parseModifiedSince } from "#core/filter.ts"
import { Gitignore } from "#core/gitignore.ts"
import { ShellBackend } from "#core/backends/shell.ts"
import { RgBackend } from "#core/backends/rg.ts"
import { FdBackend } from "#core/backends/fd.ts"
import { FffFinder } from "#core/backends/fff-finder.ts"
import {
  formatResult,
  resolveColor,
  type ColorMode,
  type Format,
} from "#core/format.ts"
import { PreviewService } from "#core/preview/file.ts"
import { QueryRouter } from "#core/query/router.ts"
import { Mode, SearchPath, type SearchFilters, type SearchQuery } from "#core/schema.ts"
import { startTui } from "#tui/start.tsx"

const queryArg = Args.text({ name: "query" }).pipe(Args.optional)

const modeOpt = Options.choice("mode", [
  "files",
  "dirs",
  "content",
  "semantic",
] as const).pipe(Options.optional)

const cwdOpt = Options.directory("cwd", { exists: "yes" }).pipe(
  Options.withDefault("."),
)

const noTuiOpt = Options.boolean("no-tui")
const noGitignoreOpt = Options.boolean("no-gitignore")

const limitOpt = Options.integer("limit").pipe(Options.optional)

const grepModeOpt = Options.choice("grep-mode", [
  "plain",
  "regex",
  "fuzzy",
] as const).pipe(Options.optional)

const formatOpt = Options.choice("format", [
  "path",
  "line",
  "json",
  "null",
] as const).pipe(Options.optional)

const colorOpt = Options.choice("color", [
  "always",
  "auto",
  "never",
] as const).pipe(Options.withDefault("auto"))

const globOpt = Options.text("glob").pipe(Options.repeated)
const typeOpt = Options.text("type").pipe(Options.repeated)
const depthOpt = Options.integer("depth").pipe(Options.optional)
const modifiedSinceOpt = Options.text("modified-since").pipe(Options.optional)
const ignoreCaseOpt = Options.boolean("ignore-case").pipe(Options.withAlias("i"))
const wordOpt = Options.boolean("word").pipe(Options.withAlias("w"))
const hiddenOpt = Options.boolean("hidden")
const contextOpt = Options.integer("context").pipe(
  Options.withAlias("C"),
  Options.optional,
)
const beforeOpt = Options.integer("before-context").pipe(
  Options.withAlias("B"),
  Options.optional,
)
const afterOpt = Options.integer("after-context").pipe(
  Options.withAlias("A"),
  Options.optional,
)

const pathsFromOpt = Options.text("paths-from").pipe(Options.optional)
const previewCmdOpt = Options.text("preview-cmd").pipe(Options.optional)
const configOpt = Options.file("config").pipe(Options.optional)
const listBackendsOpt = Options.boolean("list-backends")
const actionOpt = Options.choice("action", [
  "print",
  "open",
  "copy",
  "navigate",
  "custom",
] as const).pipe(Options.optional)
const openCmdOpt = Options.text("open-cmd").pipe(Options.optional)

/* ------------------------------------------------------------------ */
/*  Doctor                                                            */
/* ------------------------------------------------------------------ */

const tryImportVersion = (mod: string): Effect.Effect<string, Error> =>
  Effect.tryPromise({
    try: async () => {
      const pkg = await import(`${mod}/package.json`, {
        with: { type: "json" },
      })
      return (pkg.default?.version ?? pkg.version ?? "unknown") as string
    },
    catch: () => new Error(`not installed`),
  })

const doctor = Command.make(
  "doctor",
  { cwd: cwdOpt },
  (args) =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      const cwdAbs = path.resolve(args.cwd)
      const chain = yield* config.load(cwdAbs)

      const bunVersion = Bun.version
      const fffVersion = yield* tryImportVersion("@ff-labs/fff-bun").pipe(
        Effect.match({
          onSuccess: (v) => `${v} (loaded)`,
          onFailure: () => "not installed",
        }),
      )
      const qmdVersion = yield* tryImportVersion("@tobilu/qmd").pipe(
        Effect.match({
          onSuccess: (v) => `${v} (loaded)`,
          onFailure: () => "not installed",
        }),
      )

      const lines: string[] = [
        "findfile doctor",
        "---",
        `Bun version: ${bunVersion}`,
        `fff-bun: ${fffVersion}`,
        `qmd: ${qmdVersion}`,
        "Config files:",
        ...chain.sources.map((s) =>
          s.path === "(built-in defaults)"
            ? `  ${s.path}`
            : `  ${s.exists ? "✓" : "✗"} ${s.path}`,
        ),
        `Platform: ${process.platform} ${process.arch}`,
        `TTY: stdin=${process.stdin.isTTY ? "yes" : "no"} stdout=${process.stdout.isTTY ? "yes" : "no"}`,
      ]

      process.stdout.write(lines.join("\n") + "\n")
    }),
)

/* ------------------------------------------------------------------ */
/*  Config subcommands                                                */
/* ------------------------------------------------------------------ */

const indent = (n: number, s: string): string => " ".repeat(n) + s

const printConfig = (result: ConfigLoadResult): string => {
  const { resolved, sources } = result
  const lines: string[] = []

  lines.push("# Sources (low → high precedence)")
  for (const s of sources) {
    if (s.path === "(built-in defaults)") {
      lines.push(`# ${s.path}`)
    } else {
      lines.push(`# ${s.exists ? "✓" : "✗"} ${s.path}`)
    }
  }
  lines.push("")

  lines.push(`defaultMode = "${resolved.defaultMode}"`)
  lines.push(`defaultAction = "${resolved.defaultAction}"`)
  if (resolved.openCmd !== null) {
    lines.push(`openCmd = "${resolved.openCmd}"`)
  }
  lines.push("")

  lines.push("[layout]")
  lines.push(`weights = [${resolved.layout.weights.join(", ")}]`)
  if (resolved.layout.paddingTop !== 0) lines.push(`paddingTop = ${resolved.layout.paddingTop}`)
  if (resolved.layout.paddingRight !== 0) lines.push(`paddingRight = ${resolved.layout.paddingRight}`)
  if (resolved.layout.paddingBottom !== 0) lines.push(`paddingBottom = ${resolved.layout.paddingBottom}`)
  if (resolved.layout.paddingLeft !== 0) lines.push(`paddingLeft = ${resolved.layout.paddingLeft}`)
  lines.push("")

  lines.push("[qmd]")
  lines.push(`autoIndex = ${resolved.qmd.autoIndex}`)
  if (resolved.qmd.modelsDir !== null) {
    lines.push(`modelsDir = "${resolved.qmd.modelsDir}"`)
  }
  lines.push("")

  lines.push("[ignore]")
  if (resolved.ignore.extra.length > 0) {
    lines.push(`extra = [${resolved.ignore.extra.map((e) => `"${e}"`).join(", ")}]`)
  } else {
    lines.push("extra = []")
  }
  lines.push("")

  if (resolved.themeObject) {
    lines.push(`# theme = "${resolved.themeObject.name ?? "custom"}" (from config.ts)`)
    lines.push("")
  } else if (Object.keys(resolved.theme).length > 0) {
    lines.push("[theme]")
    for (const [k, v] of Object.entries(resolved.theme)) {
      lines.push(`${k} = "${v}"`)
    }
    lines.push("")
  }

  if (Object.keys(resolved.keymap).length > 0) {
    lines.push("[keymap]")
    for (const [k, v] of Object.entries(resolved.keymap)) {
      if (typeof v === "string") {
        lines.push(`${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      } else {
        lines.push(`${JSON.stringify(k)} = ${JSON.stringify(v)}`)
      }
    }
    lines.push("")
  }

  if (Object.keys(resolved.queries).length > 0) {
    for (const [name, q] of Object.entries(resolved.queries)) {
      lines.push(`[queries.${name}]`)
      if (q.text !== undefined) lines.push(`text = "${q.text}"`)
      if (q.mode !== undefined) lines.push(`mode = "${q.mode}"`)
      if (q.grepMode !== undefined) lines.push(`grepMode = "${q.grepMode}"`)
      if (q.globs !== undefined) lines.push(`globs = [${q.globs.map((g) => `"${g}"`).join(", ")}]`)
      if (q.types !== undefined) lines.push(`types = [${q.types.map((t) => `"${t}"`).join(", ")}]`)
      if (q.modifiedSince !== undefined) lines.push(`modifiedSince = "${q.modifiedSince}"`)
      lines.push("")
    }
  }

  if (Object.keys(resolved.backends).length > 0) {
    for (const [name, b] of Object.entries(resolved.backends)) {
      lines.push(`[backends.${name}]`)
      lines.push(`mode = "${b.mode}"`)
      lines.push(`command = "${b.command}"`)
      lines.push("")
    }
  }

  if (Object.keys(resolved.modeDefaults).length > 0) {
    for (const [modeName, md] of Object.entries(resolved.modeDefaults)) {
      lines.push(`[modeDefaults.${modeName}]`)
      if (md.grepMode !== undefined) lines.push(`grepMode = "${md.grepMode}"`)
      if (md.globs !== undefined) lines.push(`globs = [${md.globs.map((g) => `"${g}"`).join(", ")}]`)
      if (md.types !== undefined) lines.push(`types = [${md.types.map((t) => `"${t}"`).join(", ")}]`)
      if (md.maxDepth !== undefined) lines.push(`maxDepth = ${md.maxDepth}`)
      if (md.modifiedSince !== undefined) lines.push(`modifiedSince = "${md.modifiedSince}"`)
      if (md.caseInsensitive !== undefined) lines.push(`caseInsensitive = ${md.caseInsensitive}`)
      if (md.wordBoundary !== undefined) lines.push(`wordBoundary = ${md.wordBoundary}`)
      if (md.beforeContext !== undefined) lines.push(`beforeContext = ${md.beforeContext}`)
      if (md.afterContext !== undefined) lines.push(`afterContext = ${md.afterContext}`)
      lines.push("")
    }
  }

  if (Object.keys(resolved.backendSelection).length > 0) {
    lines.push("[backendSelection]")
    for (const [modeName, backendName] of Object.entries(resolved.backendSelection)) {
      lines.push(`${modeName} = "${backendName}"`)
    }
    lines.push("")
  }

  lines.push("# Frecency databases")
  lines.push(`# frecencyDb = "~/.local/share/findfile/frecency.db"`)
  lines.push(`# historyDb = "~/.local/share/findfile/history.db"`)
  lines.push("")

  return lines.join("\n") + "\n"
}

const configPrint = Command.make(
  "print",
  { cwd: cwdOpt },
  (args) =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      const cwdAbs = path.resolve(args.cwd)
      const result = yield* config.load(cwdAbs)
      process.stdout.write(printConfig(result))
    }),
)

const configPath = Command.make(
  "path",
  { cwd: cwdOpt },
  (args) =>
    Effect.gen(function* () {
      const config = yield* ConfigService
      const cwdAbs = path.resolve(args.cwd)
      const result = yield* config.load(cwdAbs)
      for (const s of result.sources) {
        if (s.path === "(built-in defaults)") {
          process.stdout.write(`${s.path}\n`)
        } else {
          process.stdout.write(`${s.exists ? "✓" : "✗"} ${s.path}\n`)
        }
      }
    }),
)

const configCmd = Command.make("config").pipe(
  Command.withSubcommands([configPrint, configPath]),
)

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

const initCmd = Command.make(
  "init",
  {},
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const configDir = path.join(os.homedir(), ".config", "findfile")
      const configFile = path.join(configDir, "config.toml")

      const exists = yield* fs.exists(configFile).pipe(
        Effect.orElseSucceed(() => false),
      )
      if (exists) {
        process.stdout.write(`Config already exists at ${configFile}\n`)
        return
      }

      yield* fs.makeDirectory(configDir, { recursive: true }).pipe(
        Effect.mapError((e) => new Error(`Failed to create config dir: ${e}`)),
      )

      const starter = `# findfile starter config
# Docs: https://github.com/patrickfindfile/findfile#configuration

defaultMode = "files"

[layout]
weights = [2, 3]
# paddingTop = 1
# paddingRight = 2
# paddingBottom = 1
# paddingLeft = 2

[qmd]
autoIndex = true
# modelsDir = "~/qmd-models"

[ignore]
extra = ["node_modules", ".git", "dist"]

# [theme]
# preset = "dark"

# [keymap]
# "ctrl-o" = "openFile"

# defaultAction = "print"
# openCmd = "code {path}"

# [backends.ast-grep]
# mode = "content"
# command = "sg --pattern {query} --json=stream"

# [backendSelection]
# content = "rg"
# files = "fd"

# [modeDefaults.content]
# grepMode = "regex"
# caseInsensitive = true
`

      yield* fs.writeFileString(configFile, starter).pipe(
        Effect.mapError((e) => new Error(`Failed to write config: ${e}`)),
      )

      process.stdout.write(`Created starter config at ${configFile}\n`)
    }),
)

/* ------------------------------------------------------------------ */
/*  Root search command                                               */
/* ------------------------------------------------------------------ */

const searchCmd = Command.make(
  "findfile",
  {
    query: queryArg,
    mode: modeOpt,
    cwd: cwdOpt,
    noTui: noTuiOpt,
    noGitignore: noGitignoreOpt,
    limit: limitOpt,
    grepMode: grepModeOpt,
    format: formatOpt,
    color: colorOpt,
    globs: globOpt,
    types: typeOpt,
    depth: depthOpt,
    modifiedSince: modifiedSinceOpt,
    ignoreCase: ignoreCaseOpt,
    word: wordOpt,
    hidden: hiddenOpt,
    context: contextOpt,
    before: beforeOpt,
    after: afterOpt,
    pathsFrom: pathsFromOpt,
    previewCmd: previewCmdOpt,
    config: configOpt,
    listBackends: listBackendsOpt,
    action: actionOpt,
    openCmd: openCmdOpt,
  },
  (args) =>
    Effect.gen(function* () {
      if (args.listBackends) {
        const backends = [
          { name: "fff", desc: "Built-in file finder (default for files/dirs/content)", check: "always" },
          { name: "rg", desc: "ripgrep content search", check: "rg" },
          { name: "fd", desc: "fd-find file search", check: "fd" },
          { name: "qmd", desc: "Semantic search via qmd", check: "@tobilu/qmd" },
          { name: "shell", desc: "Custom shell command backends", check: "always" },
        ]
        for (const b of backends) {
          let status = "✓"
          if (b.check !== "always") {
            try {
              const proc = Bun.spawnSync([b.check, "--version"], { stdout: "pipe", stderr: "pipe" })
              status = proc.success ? "✓" : "✗"
            } catch {
              status = "✗"
            }
          }
          process.stdout.write(`${status} ${b.name.padEnd(8)}  ${b.desc}\n`)
        }
        return
      }

      const config = yield* ConfigService
      const router = yield* QueryRouter
      const gitignore = yield* Gitignore

      const cwdAbs = path.resolve(args.cwd)
      const configResult = yield* config.load(cwdAbs, {
        defaultMode: Option.getOrUndefined(args.mode),
        configPath: Option.getOrUndefined(args.config),
      })
      const resolved = configResult.resolved

      let argText = Option.getOrElse(args.query, () => "")
      const limit = Option.getOrUndefined(args.limit)
      const stdinIsTty = Boolean(process.stdin.isTTY)

      // Resolve saved queries: `findfile :todos` looks up [queries.todos]
      let resolvedMode = args.mode
      let resolvedGrepMode = args.grepMode
      let resolvedGlobs: readonly string[] = args.globs
      let resolvedTypes: readonly string[] = args.types
      let resolvedModifiedSince = args.modifiedSince
      if (argText.startsWith(":")) {
        const name = argText.slice(1)
        const sq = resolved.queries[name]
        if (sq === undefined) {
          process.stderr.write(`unknown saved query: "${name}"\n`)
          process.exitCode = 2
          return
        }
        argText = sq.text ?? ""
        if (Option.isNone(resolvedMode) && sq.mode !== undefined) {
          resolvedMode = Option.some(sq.mode)
        }
        if (Option.isNone(resolvedGrepMode) && sq.grepMode !== undefined) {
          resolvedGrepMode = Option.some(sq.grepMode)
        }
        if (resolvedGlobs.length === 0 && sq.globs !== undefined) {
          resolvedGlobs = sq.globs
        }
        if (resolvedTypes.length === 0 && sq.types !== undefined) {
          resolvedTypes = sq.types
        }
        if (Option.isNone(resolvedModifiedSince) && sq.modifiedSince !== undefined) {
          resolvedModifiedSince = Option.some(sq.modifiedSince)
        }
      }

      const mode: Mode = Option.getOrElse(resolvedMode, () => resolved.defaultMode)

      const pathsFromRaw = Option.getOrUndefined(args.pathsFrom)
      const pathsFromStdin = pathsFromRaw === "-"
      let pathAllowlist: readonly string[] | undefined

      const readStdinWithTimeout = (ms: number): Promise<string> =>
        Promise.race([
          Bun.stdin.text(),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), ms),
          ),
        ])

      if (pathsFromRaw !== undefined) {
        const raw = pathsFromStdin
          ? yield* Effect.tryPromise({
              try: () => readStdinWithTimeout(500),
              catch: (e) => new Error(`failed to read stdin: ${String(e)}`),
            })
          : yield* Effect.tryPromise({
              try: () => Bun.file(pathsFromRaw).text(),
              catch: (e) =>
                new Error(`failed to read --paths-from "${pathsFromRaw}": ${String(e)}`),
            })
        pathAllowlist = raw
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      }

      // Read stdin as query when: no positional arg, stdin is piped,
      // and stdin wasn't already consumed by --paths-from.
      let text = argText
      if (text.length === 0 && !stdinIsTty && !pathsFromStdin) {
        try {
          const stdinText = yield* Effect.tryPromise({
            try: () => readStdinWithTimeout(500),
            catch: (e) => new Error(`failed to read stdin: ${String(e)}`),
          })
          text = stdinText.trim()
        } catch {
          // Stdin was empty / not piped — that's fine, user may just
          // have run `findfile --no-tui` with no query.
          text = ""
        }
      }

      const ctx = Option.getOrUndefined(args.context)
      const beforeCtx = Option.getOrUndefined(args.before) ?? ctx
      const afterCtx = Option.getOrUndefined(args.after) ?? ctx

      const modifiedSinceRaw = Option.getOrUndefined(resolvedModifiedSince)
      let modifiedSinceSec: number | undefined
      if (modifiedSinceRaw !== undefined) {
        const parsed = parseModifiedSince(modifiedSinceRaw)
        if (parsed === null) {
          process.stderr.write(
            `invalid --modified-since value: "${modifiedSinceRaw}" (expected e.g. "2d", "30m", or "2026-04-01")\n`,
          )
          process.exitCode = 2
          return
        }
        modifiedSinceSec = parsed
      }

      // Apply per-mode defaults, letting CLI flags override
      const modeDefaults = getModeDefaults(resolved, mode)
      const defaultGlobs = modeDefaults?.globs ?? []
      const defaultTypes = modeDefaults?.types ?? []
      const defaultModifiedSince = modeDefaults?.modifiedSince
      let defaultModifiedSinceSec: number | undefined
      if (defaultModifiedSince !== undefined) {
        const parsed = parseModifiedSince(defaultModifiedSince)
        if (parsed !== null) defaultModifiedSinceSec = parsed
      }

      const mergedGlobs = [...defaultGlobs, ...resolvedGlobs]
      const mergedTypes = [...defaultTypes, ...resolvedTypes]

      const filters: SearchFilters = {
        ...(mergedGlobs.length > 0 ? { globs: mergedGlobs } : {}),
        ...(mergedTypes.length > 0 ? { types: mergedTypes } : {}),
        ...(Option.isSome(args.depth)
          ? { maxDepth: args.depth.value }
          : modeDefaults?.maxDepth !== undefined
            ? { maxDepth: modeDefaults.maxDepth }
            : {}),
        ...(modifiedSinceSec !== undefined
          ? { modifiedSinceSec }
          : defaultModifiedSinceSec !== undefined
            ? { modifiedSinceSec: defaultModifiedSinceSec }
            : {}),
        ...(args.ignoreCase
          ? { caseInsensitive: true }
          : modeDefaults?.caseInsensitive !== undefined
            ? { caseInsensitive: modeDefaults.caseInsensitive }
            : {}),
        ...(args.word
          ? { wordBoundary: true }
          : modeDefaults?.wordBoundary !== undefined
            ? { wordBoundary: modeDefaults.wordBoundary }
            : {}),
        ...(args.hidden
          ? { hidden: true }
          : modeDefaults?.hidden !== undefined
            ? { hidden: modeDefaults.hidden }
            : {}),
        ...(beforeCtx !== undefined
          ? { beforeContext: beforeCtx }
          : modeDefaults?.beforeContext !== undefined
            ? { beforeContext: modeDefaults.beforeContext }
            : {}),
        ...(afterCtx !== undefined
          ? { afterContext: afterCtx }
          : modeDefaults?.afterContext !== undefined
            ? { afterContext: modeDefaults.afterContext }
            : {}),
        ...(pathAllowlist !== undefined ? { pathAllowlist } : {}),
      }
      const hasFilters = Object.keys(filters).length > 0

      const ffMatcher = yield* gitignore.loadFindfileOnly(cwdAbs)

      const query: SearchQuery = {
        text,
        mode,
        cwd: SearchPath.make(cwdAbs),
        ...(limit !== undefined ? { limit } : {}),
        grepMode: Option.getOrElse(resolvedGrepMode, () =>
          modeDefaults?.grepMode ?? "plain"),
        ...(hasFilters ? { filters } : {}),
        findfileIgnore: (relPath) => ffMatcher.isIgnored(relPath),
      }

      const stdoutIsTty = Boolean(process.stdout.isTTY)
      const useTui = !args.noTui && stdoutIsTty && stdinIsTty

      if (useTui) {
        const tuiFormat: Format = Option.match(args.format, {
          onNone: () => (mode === "content" ? "line" : "path"),
          onSome: (f) => f,
        })
        const tuiColor = resolveColor(args.color as ColorMode, stdoutIsTty)
        const submitAction = {
          type: Option.getOrElse(args.action, () => resolved.defaultAction),
          customCmd: Option.getOrUndefined(args.openCmd) ?? resolved.openCmd ?? undefined,
        } as const
        yield* startTui({
          cwd: query.cwd,
          initialMode: mode,
          initialQuery: text,
          limit: limit ?? 200,
          weights: resolved.layout.weights,
          format: tuiFormat,
          previewCmd: Option.getOrUndefined(args.previewCmd) ?? null,
          useColor: tuiColor,
          theme: resolved.themeObject,
          keymap: Object.keys(resolved.keymap).length > 0 ? (resolved.keymap as Record<string, unknown>) : null,
          modeDefaults: resolved.modeDefaults,
          submitAction,
          openCmd: Option.getOrUndefined(args.openCmd) ?? resolved.openCmd ?? null,
          padding: {
            top: resolved.layout.paddingTop,
            right: resolved.layout.paddingRight,
            bottom: resolved.layout.paddingBottom,
            left: resolved.layout.paddingLeft,
          },
          layoutPrefs: {
            previewWeight: resolved.layout.previewWeight,
            showPreview: resolved.layout.showPreview,
            showBreadcrumbs: resolved.layout.showBreadcrumbs,
            showStatusBar: resolved.layout.showStatusBar,
            showScrollbars: resolved.layout.showScrollbars,
          },
        })
        return
      }

      const format: Format = Option.match(args.format, {
        onNone: () => (mode === "content" ? "line" : "path"),
        onSome: (f) => f,
      })
      const colorMode: ColorMode = args.color as ColorMode
      const useColor = resolveColor(colorMode, stdoutIsTty)

      const hadHit = yield* Ref.make(false)
      const base = router.search(query)
      const stream = limit !== undefined ? Stream.take(base, limit) : base

      yield* Stream.runForEach(stream, (r) =>
        Effect.sync(() => {
          process.stdout.write(formatResult(r, format, useColor))
        }).pipe(Effect.zipLeft(Ref.set(hadHit, true))),
      ).pipe(
        Effect.catchTag("QmdUnavailableError", (e) =>
          Effect.sync(() => {
            process.stderr.write(
              `semantic mode unavailable (qmd not installed): ${e.reason}\n`,
            )
            process.exitCode = 2
          }),
        ),
      )

      if (process.exitCode === undefined || process.exitCode === 0) {
        const hit = yield* Ref.get(hadHit)
        process.exitCode = hit ? 0 : 1
      }
    }),
)

/* ------------------------------------------------------------------ */
/*  Completions                                                       */
/* ------------------------------------------------------------------ */

const TYPE_ALIASES = [
  "ts", "js", "py", "rs", "go", "md", "json", "yaml", "toml",
  "rust", "tsx", "css", "html", "sh", "sql", "java", "cpp", "c",
  "rb", "php", "lua", "swift", "zig", "kt",
]

const bashCompletions = (): string => `\
_findfile_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local opts="--mode --cwd --no-tui --no-gitignore --limit --grep-mode --format --color --glob --type --depth --modified-since --ignore-case --word --hidden --context --before-context --after-context --paths-from --preview-cmd --config --list-backends --help"
  local modes="files dirs content semantic"
  local grepModes="plain regex fuzzy"
  local formats="path line json null"
  local colors="always auto never"

  case "\${COMP_WORDS[COMP_CWORD-1]}" in
    --mode) COMPREPLY=($(compgen -W "$modes" -- "$cur")); return ;;
    --grep-mode) COMPREPLY=($(compgen -W "$grepModes" -- "$cur")); return ;;
    --format) COMPREPLY=($(compgen -W "$formats" -- "$cur")); return ;;
    --color) COMPREPLY=($(compgen -W "$colors" -- "$cur")); return ;;
    --type) COMPREPLY=($(compgen -W "${TYPE_ALIASES.join(" ")}" -- "$cur")); return ;;
    --cwd) COMPREPLY=($(compgen -d -- "$cur")); return ;;
    --config|--paths-from) COMPREPLY=($(compgen -f -- "$cur")); return ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$opts" -- "$cur"))
  else
    COMPREPLY=($(compgen -f -- "$cur"))
  fi
}
complete -F _findfile_completions findfile
`

const zshCompletions = (): string => `\
#compdef findfile

local -a modes=(files dirs content semantic)
local -a grepModes=(plain regex fuzzy)
local -a formats=(path line json null)
local -a colors=(always auto never)
local -a types=(${TYPE_ALIASES.map((t) => `"${t}"`).join(" ")})

_arguments \\
  '(--mode)--mode[Search mode]:mode:(files dirs content semantic)' \\
  '(--cwd)--cwd[Working directory]:directory:_directories' \\
  '--no-tui[Disable TUI]' \\
  '--no-gitignore[Disable .gitignore]' \\
  '(--limit)--limit[Result limit]:limit:' \\
  '(--grep-mode)--grep-mode[Grep mode]:mode:(plain regex fuzzy)' \\
  '(--format)--format[Output format]:format:(path line json null)' \\
  '(--color)--color[Color mode]:mode:(always auto never)' \\
  '(--glob)--glob[Glob filter]:glob:' \\
  '(--type)--type[File type alias]:type:($types)' \\
  '(--depth)--depth[Max depth]:depth:' \\
  '(--modified-since)--modified-since[Modified since]:time:' \\
  '--ignore-case[Case insensitive]' \\
  '--word[Word boundary]' \\
  '--hidden[Include hidden files]' \\
  '(--context)--context[Context lines]:lines:' \\
  '(--before-context)--before-context[Before context]:lines:' \\
  '(--after-context)--after-context[After context]:lines:' \\
  '(--paths-from)--paths-from[Paths from file]:file:_files' \\
  '(--preview-cmd)--preview-cmd[Preview command]:cmd:' \\
  '(--config)--config[Config file]:file:_files' \\
  '--list-backends[List backends]' \\
  '1::query:_files' \\
  '*::args:_files'
`

const fishCompletions = (): string => `\
complete -c findfile -s h -l help -d "Show help"
complete -c findfile -l mode -xa "files dirs content semantic" -d "Search mode"
complete -c findfile -l cwd -xa "(__fish_complete_directories)" -d "Working directory"
complete -c findfile -l no-tui -d "Disable TUI"
complete -c findfile -l no-gitignore -d "Disable .gitignore"
complete -c findfile -l limit -d "Result limit"
complete -c findfile -l grep-mode -xa "plain regex fuzzy" -d "Grep mode"
complete -c findfile -l format -xa "path line json null" -d "Output format"
complete -c findfile -l color -xa "always auto never" -d "Color mode"
complete -c findfile -l glob -d "Glob filter"
complete -c findfile -l type -xa "${TYPE_ALIASES.join(" ")}" -d "File type alias"
complete -c findfile -l depth -d "Max depth"
complete -c findfile -l modified-since -d "Modified since"
complete -c findfile -l ignore-case -s i -d "Case insensitive"
complete -c findfile -l word -s w -d "Word boundary"
complete -c findfile -l hidden -d "Include hidden files"
complete -c findfile -l context -s C -d "Context lines"
complete -c findfile -l before-context -s B -d "Before context"
complete -c findfile -l after-context -s A -d "After context"
complete -c findfile -l paths-from -xa "(__fish_complete_path)" -d "Paths from file"
complete -c findfile -l preview-cmd -d "Preview command"
complete -c findfile -l config -xa "(__fish_complete_path)" -d "Config file"
complete -c findfile -l list-backends -d "List backends"
`

const completionsCmd = Command.make(
  "completions",
  {
    shell: Options.choice("shell", ["bash", "zsh", "fish"] as const).pipe(
      Options.withDefault("bash"),
    ),
  },
  (args) =>
    Effect.gen(function* () {
      const script =
        args.shell === "zsh" ? zshCompletions() : args.shell === "fish" ? fishCompletions() : bashCompletions()
      process.stdout.write(script)
    }),
)

const root = Command.withSubcommands(searchCmd, [doctor, configCmd, initCmd, completionsCmd])

const cli = Command.run(root, {
  name: "findfile",
  version: "0.1.0",
})

const AppLive = Layer.mergeAll(
  ConfigService.Default,
  QueryRouter.Default,
  PreviewService.Default,
  Gitignore.Default,
  ShellBackend.Default,
  RgBackend.Default,
  FdBackend.Default,
  FffFinder.Default,
).pipe(Layer.provideMerge(BunContext.layer))

cli(process.argv).pipe(
  Effect.scoped,
  Effect.provide(AppLive),
  BunRuntime.runMain,
)
