import { Chunk, Effect, Stream } from "effect"
import { SearchExecutionError, type SearchError } from "../errors.ts"
import type { BackendSearch } from "./backend.ts"
import {
  type Mode,
  type SearchQuery,
  type SearchResult,
  SearchPath,
  Source,
} from "../schema.ts"
import { ConfigService } from "../config.ts"
import path from "node:path"

interface JsonlResult {
  readonly relativePath: string
  readonly match?: {
    readonly line: number
    readonly col: number
    readonly preview: string
  }
}

/** Escape a value for safe inclusion in a POSIX shell single-quoted string. */
const shellEscape = (value: string): string => {
  // Wrap in single quotes; embedded single quotes become '"'"'
  return "'" + value.replace(/'/g, "'\"'\"'") + "'"
}

const substituteCommand = (cmd: string, query: SearchQuery): string =>
  cmd
    .replace(/\{query\}/g, shellEscape(query.text))
    .replace(/\{cwd\}/g, shellEscape(query.cwd))

const jsonlToResult = (cwd: string, name: string, obj: JsonlResult): SearchResult => ({
  path: SearchPath.make(path.resolve(cwd, obj.relativePath)),
  relativePath: obj.relativePath,
  kind: "file",
  source: Source.make(name),
  ...(obj.match
    ? {
        match: {
          line: obj.match.line,
          col: obj.match.col,
          preview: obj.match.preview,
        },
      }
    : {}),
})

const runBackend = (
  name: string,
  command: string,
  query: SearchQuery,
): Stream.Stream<SearchResult, SearchError> =>
  Stream.fromEffect(
    Effect.gen(function* () {
      const proc = Bun.spawn(["sh", "-c", substituteCommand(command, query)], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: query.cwd,
      })

      const result = yield* Effect.tryPromise({
        try: () => Bun.readableStreamToText(proc.stdout),
        catch: (e) =>
          new SearchExecutionError({
            backend: name,
            query: query.text,
            message: `stdout read failed: ${String(e)}`,
          }),
      }).pipe(Effect.timeout("10 seconds"))

      // Best-effort cleanup regardless of success/failure
      yield* Effect.sync(() => {
        try {
          proc.kill()
        } catch {
          // ignore
        }
      })

      const lines = result
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)

      const results: SearchResult[] = []
      for (const line of lines) {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(line) as JsonlResult,
          catch: (e) =>
            new SearchExecutionError({
              backend: name,
              query: query.text,
              message: `JSON parse error: ${String(e)}`,
            }),
        })
        results.push(jsonlToResult(query.cwd, name, parsed))
      }

      return Chunk.fromIterable(results)
    }).pipe(
      Effect.catchAll((e) =>
        Effect.sync(() => {
          process.stderr.write(
            `custom backend "${name}" error: ${e instanceof Error ? e.message : String(e)}\n`,
          )
        }).pipe(Effect.as(Chunk.empty<SearchResult>())),
      ),
    ),
  ).pipe(Stream.flattenChunks)

/**
 * Custom backend that shells out to user-defined commands.
 *
 * Configured via TOML:
 * ```toml
 * [backends.ast-grep]
 * mode = "content"
 * command = "sg --pattern {query} --json=stream"
 * ```
 *
 * The command must emit JSONL where each line is:
 * `{ "relativePath": "...", "match": { "line": 1, "col": 1, "preview": "..." } }`
 *
 * Tokens `{query}` and `{cwd}` are substituted with shell-escaped values
 * before execution to prevent injection.
 */
export class ShellBackend extends Effect.Service<ShellBackend>()("findfile/ShellBackend", {
  accessors: true,
  dependencies: [ConfigService.Default],
  effect: Effect.gen(function* () {
    const configService = yield* ConfigService

    // Cache backends config per cwd to avoid reloading on every keystroke
    const backendsCache = new Map<string, Array<[string, { mode: Mode; command: string }]>>()

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.unwrap(
        Effect.gen(function* () {
          let backends = backendsCache.get(query.cwd)
          if (backends === undefined) {
            const config = yield* configService.load(query.cwd).pipe(
              Effect.catchAll(() => Effect.succeed({ resolved: { backends: {} } })),
            )
            backends = Object.entries(config.resolved.backends).filter(
              ([, b]) => b.mode === query.mode,
            ) as Array<[string, { mode: Mode; command: string }]>
            backendsCache.set(query.cwd, backends)
          }
          if (backends.length === 0) return Stream.empty

          const streams = backends.map(([name, b]) => runBackend(name, b.command, query))
          return Stream.mergeAll(streams, { concurrency: "unbounded" })
        }),
      )

    const supports = (mode: Mode) => true

    return { search, supports } satisfies BackendSearch
  }),
}) {}
