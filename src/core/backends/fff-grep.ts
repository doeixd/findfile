import { Chunk, Effect, Option, Stream } from "effect"
import type { GrepCursor, GrepMatch } from "@ff-labs/fff-bun"
import path from "node:path"
import { FffFinder } from "./fff-finder.ts"
import { SearchExecutionError, type SearchError } from "../errors.ts"
import type { BackendSearch } from "./backend.ts"
import {
  type Mode,
  type SearchQuery,
  type SearchResult,
  SearchPath,
  Source,
} from "../schema.ts"

const PAGE_LIMIT = 50
const DEFAULT_TIME_BUDGET_MS = 5000

const toAbsolute = (cwd: string, relative: string): SearchPath =>
  SearchPath.make(path.resolve(cwd, relative))

const matchToResult = (cwd: string, m: GrepMatch): SearchResult => ({
  path: toAbsolute(cwd, m.relativePath),
  relativePath: m.relativePath,
  kind: "file",
  score: m.fuzzyScore,
  gitStatus: m.gitStatus,
  source: Source.make("fff-grep"),
  modifiedSec: m.modified,
  match: {
    line: m.lineNumber,
    col: m.col,
    preview: m.lineContent,
    ranges: m.matchRanges,
    ...(m.contextBefore && m.contextBefore.length > 0
      ? { contextBefore: m.contextBefore }
      : {}),
    ...(m.contextAfter && m.contextAfter.length > 0
      ? { contextAfter: m.contextAfter }
      : {}),
  },
})

/**
 * Content grep backend backed by `FileFinder.grep`. Uses opaque cursor
 * pagination: each iteration fetches up to `PAGE_LIMIT` matches then
 * follows `nextCursor` until exhausted.
 */
export class FffGrep extends Effect.Service<FffGrep>()("findfile/FffGrep", {
  accessors: true,
  dependencies: [FffFinder.Default],
  effect: Effect.gen(function* () {
    const finders = yield* FffFinder

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.paginateChunkEffect<GrepCursor | null, SearchResult, SearchError, never>(
        null,
        (cursor) =>
          Effect.gen(function* () {
            const finder = yield* finders.get(query.cwd)
            const filters = query.filters
            // `-i` implementation: lowercase the pattern. fff-bun's smartCase
            // kicks in when the pattern is all-lowercase, yielding
            // case-insensitive behavior. The alternative (inline `(?i)` in
            // regex mode) would change the grep mode unexpectedly.
            const text = filters?.caseInsensitive ? query.text.toLowerCase() : query.text
            const r = finder.grep(text, {
              mode: query.grepMode ?? "plain",
              maxMatchesPerFile: PAGE_LIMIT,
              timeBudgetMs: DEFAULT_TIME_BUDGET_MS,
              cursor,
              ...(filters?.beforeContext !== undefined
                ? { beforeContext: filters.beforeContext }
                : {}),
              ...(filters?.afterContext !== undefined
                ? { afterContext: filters.afterContext }
                : {}),
            })
            if (!r.ok) {
              return yield* Effect.fail(
                new SearchExecutionError({
                  backend: "fff-grep",
                  query: query.text,
                  message: r.error,
                }),
              )
            }
            const chunk = Chunk.fromIterable(
              r.value.items.map((m) => matchToResult(query.cwd, m)),
            )
            const nextCursor = r.value.nextCursor
            const next: Option.Option<GrepCursor | null> =
              nextCursor === null ? Option.none() : Option.some(nextCursor)
            return [chunk, next] as const
          }),
      )

    const supports = (mode: Mode) => mode === "content"

    return { search, supports } satisfies BackendSearch
  }),
}) {}
