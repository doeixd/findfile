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

const FD_SOURCE = Source.make("fd")

const fdUnavailable = (): boolean => {
  try {
    const proc = Bun.spawnSync(["fd", "--version"], { stdout: "pipe", stderr: "pipe" })
    return proc.success
  } catch {
    return false
  }
}

const buildArgs = (query: SearchQuery): string[] => {
  const args: string[] = []
  const filters = query.filters

  if (query.mode === "dirs") {
    args.push("--type", "directory")
  } else {
    args.push("--type", "file")
  }

  if (filters?.globs !== undefined && filters.globs.length > 0) {
    for (const g of filters.globs) {
      args.push("--glob", g)
    }
  }
  if (filters?.maxDepth !== undefined) {
    args.push("--max-depth", String(filters.maxDepth))
  }
  if (filters?.modifiedSinceSec !== undefined) {
    const days = Math.ceil(filters.modifiedSinceSec / 86400)
    args.push("--changed-within", `${days}d`)
  }
  if (filters?.hidden) {
    args.push("--hidden")
  }

  args.push("--", query.text, query.cwd)
  return args
}

/**
 * File/directory search backend powered by `fd`.
 *
 * Spawns `fd` and streams results line by line. Gracefully degrades
 * to empty stream if fd is not installed. Process and reader are
 * cleaned up if the stream consumer interrupts the fiber.
 */
export class FdBackend extends Effect.Service<FdBackend>()("findfile/FdBackend", {
  accessors: true,
  effect: Effect.gen(function* () {
    const available = yield* Effect.sync(() => fdUnavailable())

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.unwrap(
        Effect.scoped(
          Effect.gen(function* () {
            if (!available) {
              return yield* Effect.fail(
                new BackendInitError({
                  backend: "fd",
                  cwd: query.cwd,
                  message: "fd is not installed or not in PATH",
                }),
              )
            }

            const proc = Bun.spawn(["fd", ...buildArgs(query)], {
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
                        backend: "fd",
                        query: query.text,
                        message: `read error: ${String(e)}`,
                      }),
                  })

                  if (done) {
                    const lines = buffer.split("\n").filter((l) => l.trim().length > 0)
                    buffer = ""
                    const results = lines.map((line): SearchResult => {
                      const rel = path.relative(query.cwd, line)
                      return {
                        path: SearchPath.make(path.resolve(line)),
                        relativePath: rel || line,
                        kind: query.mode === "dirs" ? "dir" : "file",
                        source: FD_SOURCE,
                      }
                    })
                    return [Chunk.fromIterable(results), Option.none<string>()] as const
                  }

                  buffer += decoder.decode(value, { stream: true })
                  const lines = buffer.split("\n")
                  buffer = lines.pop() ?? ""
                  const results = lines.map((line): SearchResult => {
                    const rel = path.relative(query.cwd, line)
                    return {
                      path: SearchPath.make(path.resolve(line)),
                      relativePath: rel || line,
                      kind: query.mode === "dirs" ? "dir" : "file",
                      source: FD_SOURCE,
                    }
                  })
                  return [Chunk.fromIterable(results), Option.some("")] as const
                }).pipe(
                  Effect.catchAll((e) =>
                    Effect.sync(() => {
                      process.stderr.write(
                        `fd backend error: ${e instanceof Error ? e.message : String(e)}\n`,
                      )
                    }).pipe(Effect.as([Chunk.empty<SearchResult>(), Option.none<string>()] as const)),
                  ),
                ),
            )
          }),
        ),
      )

    const supports = (mode: Mode) => mode === "files" || mode === "dirs"

    return { search, supports } satisfies BackendSearch
  }),
}) {}
