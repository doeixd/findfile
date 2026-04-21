import { Effect, Stream } from "effect"
import { FffFiles } from "../backends/fff-files.ts"
import { FffGrep } from "../backends/fff-grep.ts"
import { Qmd } from "../backends/qmd.ts"
import { ShellBackend } from "../backends/shell.ts"
import { RgBackend } from "../backends/rg.ts"
import { FdBackend } from "../backends/fd.ts"
import { ConfigService } from "../config.ts"
import { QmdUnavailableError, type SearchError } from "../errors.ts"
import { buildFilter } from "../filter.ts"
import type { Mode, SearchQuery, SearchResult } from "../schema.ts"

const isMarkdownHit = (r: SearchResult): boolean =>
  r.relativePath.toLowerCase().endsWith(".md")

/**
 * Routes a {@link SearchQuery} to one or more backends based on
 * {@link SearchQuery.mode} and user config:
 *
 * - `files` / `dirs`  → FffFiles (or FdBackend if configured)
 * - `content`         → FffGrep (or RgBackend if configured)
 *                        + Qmd (md-only, when available)
 *                        + any custom ShellBackends
 * - `semantic`        → Qmd; streams {@link QmdUnavailableError} if qmd
 *                       failed to load so the UI can disable the mode
 *
 * Backend selection is controlled via config:
 * ```toml
 * [backendSelection]
 * content = "rg"
 * files = "fd"
 * ```
 *
 * Every branch returns a uniform `Stream<SearchResult, SearchError>`.
 */
export class QueryRouter extends Effect.Service<QueryRouter>()("findfile/QueryRouter", {
  accessors: true,
  dependencies: [
    FffFiles.Default,
    FffGrep.Default,
    Qmd.Default,
    ShellBackend.Default,
    RgBackend.Default,
    FdBackend.Default,
    ConfigService.Default,
  ],
  effect: Effect.gen(function* () {
    const files = yield* FffFiles
    const grep = yield* FffGrep
    const qmd = yield* Qmd
    const shell = yield* ShellBackend
    const rg = yield* RgBackend
    const fd = yield* FdBackend
    const config = yield* ConfigService

    // Cache config per cwd to avoid disk I/O on every keystroke
    const configCache = new Map<string, { backendSelection: Readonly<Record<string, string>> }>()

    const getCachedConfig = Effect.fn("QueryRouter.getCachedConfig")(function* (cwd: string) {
      const hit = configCache.get(cwd)
      if (hit !== undefined) return hit
      const cfg = yield* config.load(cwd).pipe(
        Effect.catchAll(() => Effect.succeed({ resolved: { backendSelection: {} as Record<string, string> } })),
      )
      const result = { backendSelection: cfg.resolved.backendSelection }
      configCache.set(cwd, result)
      return result
    })

    const qmdSoft = (q: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      qmd.search(q).pipe(
        Stream.catchTag("QmdUnavailableError", () => Stream.empty),
      )

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const { backendSelection: selection } = yield* getCachedConfig(query.cwd)

          const filter = buildFilter(query.filters, query.findfileIgnore)
          const apply = (s: Stream.Stream<SearchResult, SearchError>) =>
            Stream.filter(s, filter)

          switch (query.mode) {
            case "files":
            case "dirs": {
              const backend = selection[query.mode] === "fd" ? fd : files
              return apply(Stream.merge(backend.search(query), shell.search(query)))
            }
            case "content": {
              const backend = selection[query.mode] === "rg" ? rg : grep
              const grepStream = backend.search(query)
              const mdStream = qmdSoft(query).pipe(Stream.filter(isMarkdownHit))
              const shellStream = shell.search(query)
              return apply(
                Stream.mergeAll([grepStream, mdStream, shellStream], { concurrency: "unbounded" }),
              )
            }
            case "semantic":
              return apply(Stream.merge(qmdSoft(query), shell.search(query)))
          }
        }),
      )

    return { search }
  }),
}) {}

export { QmdUnavailableError }
