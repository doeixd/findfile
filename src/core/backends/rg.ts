import { Chunk, Effect, Option, Stream } from "effect"
import path from "node:path"
import {
  BackendInitError,
  SearchExecutionError,
  type SearchError,
} from "../errors.ts"
import type { BackendSearch } from "./backend.ts"
import {
  type Mode,
  type SearchQuery,
  type SearchResult,
  SearchPath,
  Source,
} from "../schema.ts"

/** Result type for `rg --json` output */
interface RgJsonLine {
  readonly type: "begin" | "match" | "end" | "summary" | "context"
  readonly data: {
    readonly path?: { readonly text: string }
    readonly lines?: { readonly text: string }
    readonly line_number?: number
    readonly absolute_offset?: number
    readonly submatches?: Array<{
      readonly match: { readonly text: string }
      readonly start: number
      readonly end: number
    }>
  }
}

const RG_SOURCE = Source.make("rg")

const rgUnavailable = (): boolean => {
  try {
    const proc = Bun.spawnSync(["rg", "--version"], { stdout: "pipe", stderr: "pipe" })
    return proc.success
  } catch {
    return false
  }
}

const buildArgs = (query: SearchQuery): string[] => {
  const args = ["--json", "--line-number", "--column"]

  const filters = query.filters
  if (filters?.globs !== undefined && filters.globs.length > 0) {
    for (const g of filters.globs) {
      args.push("--glob", g)
    }
  }
  if (filters?.caseInsensitive) {
    args.push("--ignore-case")
  }
  if (filters?.wordBoundary) {
    args.push("--word-regexp")
  }
  if (filters?.hidden) {
    args.push("--hidden")
  }
  if (filters?.beforeContext !== undefined) {
    args.push("-B", String(filters.beforeContext))
  }
  if (filters?.afterContext !== undefined) {
    args.push("-A", String(filters.afterContext))
  }
  if (query.grepMode === "regex") {
    args.push("--regexp")
  } else if (query.grepMode === "fuzzy") {
    // rg doesn't have native fuzzy; fall back to regex with smart case
    args.push("--smart-case")
  } else {
    args.push("--fixed-strings")
  }

  args.push("--", query.text, query.cwd)
  return args
}

const parseLine = (line: string): SearchResult | null => {
  let json: RgJsonLine
  try {
    json = JSON.parse(line) as RgJsonLine
  } catch {
    return null
  }
  if (json.type !== "match") return null

  const d = json.data
  const relPath = d.path?.text ?? ""
  const lineNum = d.line_number ?? 0
  const preview = d.lines?.text?.replace(/\n$/, "") ?? ""
  const ranges = d.submatches?.map((sm) => [sm.start, sm.end] as [number, number]) ?? []

  return {
    path: SearchPath.make(path.resolve(relPath)),
    relativePath: relPath,
    kind: "file",
    source: RG_SOURCE,
    match: {
      line: lineNum,
      col: ranges[0]?.[0] ?? 0,
      preview,
      ranges,
    },
  }
}

/**
 * Content search backend powered by ripgrep (`rg`).
 *
 * Uses `rg --json` for structured output with match ranges, line
 * numbers, and context. Gracefully degrades to empty stream if rg
 * is not installed. Process and reader are cleaned up on interruption.
 */
export class RgBackend extends Effect.Service<RgBackend>()("findfile/RgBackend", {
  accessors: true,
  effect: Effect.gen(function* () {
    const available = yield* Effect.sync(() => rgUnavailable())

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.unwrap(
        Effect.scoped(
          Effect.gen(function* () {
            if (!available) {
              return yield* Effect.fail(
                new BackendInitError({
                  backend: "rg",
                  cwd: query.cwd,
                  message: "ripgrep (rg) is not installed or not in PATH",
                }),
              )
            }

            const proc = Bun.spawn(["rg", ...buildArgs(query)], {
              stdout: "pipe",
              stderr: "pipe",
            })

            const reader = proc.stdout.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                try {
                  reader.cancel()
                } catch {
                  // ignore
                }
                try {
                  proc.kill()
                } catch {
                  // ignore
                }
              }),
            )

            return Stream.paginateChunkEffect<string, SearchResult, SearchError, never>(
              "",
              () =>
                Effect.gen(function* () {
                  const { done, value } = yield* Effect.tryPromise({
                    try: () => reader.read(),
                    catch: (e) =>
                      new SearchExecutionError({
                        backend: "rg",
                        query: query.text,
                        message: `read error: ${String(e)}`,
                      }),
                  })

                  if (done) {
                    const lines = buffer.split("\n").filter((l) => l.trim().length > 0)
                    buffer = ""
                    const results = lines.map(parseLine).filter((r): r is SearchResult => r !== null)
                    return [Chunk.fromIterable(results), Option.none<string>()] as const
                  }

                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split("\n")
                  buffer = lines.pop() ?? ""
                  const results = lines.map(parseLine).filter((r): r is SearchResult => r !== null)
                  return [Chunk.fromIterable(results), Option.some("")] as const
                }).pipe(
                  Effect.catchAll((e) =>
                    Effect.sync(() => {
                      process.stderr.write(
                        `rg backend error: ${e instanceof Error ? e.message : String(e)}\n`,
                      )
                    }).pipe(Effect.as([Chunk.empty<SearchResult>(), Option.none<string>()] as const)),
                  ),
                ),
            )
          }),
        ),
      )

    const supports = (mode: Mode) => mode === "content"

    return { search, supports } satisfies BackendSearch
  }),
}) {}
