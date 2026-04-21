import { Chunk, Effect, Option, Stream } from "effect"
import type { FileItem, Score } from "@ff-labs/fff-bun"
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
} from "#core/schema.ts"

const PAGE_SIZE = 50

const toAbsolute = (cwd: string, relative: string): SearchPath =>
  SearchPath.make(path.resolve(cwd, relative))

const fileItemToResult = (
  cwd: string,
  item: FileItem,
  score: Score | undefined,
): SearchResult => ({
  path: toAbsolute(cwd, item.relativePath),
  relativePath: item.relativePath,
  kind: "file",
  score: score?.total,
  gitStatus: item.gitStatus,
  source: Source.make("fff"),
  modifiedSec: item.modified,
})

/* ------------------------------------------------------------------ */
/*  Directory-search fallback (fff-bun directorySearch is broken)     */
/* ------------------------------------------------------------------ */

/**
 * FFF-native dirs mode: search files with FFF's fuzzy matching, then
 * return the parent directories of the matching files.
 *
 * This gives us FFF's native fuzzy scoring for free, and is often
 * more useful than raw directory-name matching (typing "test" finds
 * directories that contain test files).
 */
const searchDirsViaFiles = (
  finder: {
    fileSearch: (q: string, opts: unknown) => { ok: boolean; value?: { items: Array<{ relativePath: string }>; scores: Score[] }; error?: string }
  },
  query: SearchQuery,
  pageIndex: number,
): { results: SearchResult[]; hasMore: boolean } => {
  const r = finder.fileSearch(query.text, { pageIndex, pageSize: PAGE_SIZE })
  if (!r.ok || !r.value) {
    return { results: [], hasMore: false }
  }

  // Extract directories from file results, keeping best score per dir
  const dirMap = new Map<string, { score: number; sourcePath: string }>()
  for (const [i, item] of r.value.items.entries()) {
    const dir = path.dirname(item.relativePath)
    if (dir === ".") continue
    const score = r.value.scores[i]?.total ?? 0
    const existing = dirMap.get(dir)
    if (existing === undefined || score > existing.score) {
      dirMap.set(dir, { score, sourcePath: item.relativePath })
    }
  }

  const results: SearchResult[] = Array.from(dirMap.entries()).map(([dir, info]) => ({
    path: toAbsolute(query.cwd, dir),
    relativePath: dir,
    kind: "dir",
    score: info.score,
    source: Source.make("fff"),
  }))

  // Sort by score descending
  results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return {
    results,
    hasMore: r.value.items.length === PAGE_SIZE,
  }
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

/**
 * Files + directories backend backed by `FileFinder.fileSearch` /
 * `directorySearch`. Streams results page by page.
 *
 * NOTE: `directorySearch` in fff-bun is currently broken (always returns
 * 0 results), so dirs mode falls back to extracting directories from the
 * file index and scoring them with a simple fuzzy matcher.
 */
export class FffFiles extends Effect.Service<FffFiles>()("findfile/FffFiles", {
  accessors: true,
  dependencies: [FffFinder.Default],
  effect: Effect.gen(function* () {
    const finders = yield* FffFinder

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.paginateChunkEffect<number, SearchResult, SearchError, never>(0, (pageIndex) =>
        Effect.gen(function* () {
          const finder = yield* finders.get(query.cwd)

          if (query.mode === "dirs") {
            const { results, hasMore } = searchDirsViaFiles(
              finder as unknown as Parameters<typeof searchDirsViaFiles>[0],
              query,
              pageIndex,
            )
            const chunk = Chunk.fromIterable(results)
            const nextPage = hasMore ? Option.some(pageIndex + 1) : Option.none<number>()
            return [chunk, nextPage] as const
          }

          const r = finder.fileSearch(query.text, { pageIndex, pageSize: PAGE_SIZE })
          if (!r.ok) {
            return yield* Effect.fail(
              new SearchExecutionError({
                backend: "fff-files",
                query: query.text,
                message: r.error,
              }),
            )
          }
          const items = r.value.items
          const chunk = Chunk.fromIterable(
            items.map((item, i) => fileItemToResult(query.cwd, item, r.value.scores[i])),
          )
          const nextPage =
            items.length === PAGE_SIZE ? Option.some(pageIndex + 1) : Option.none<number>()
          return [chunk, nextPage] as const
        }),
      )

    const supports = (mode: Mode) => mode === "files" || mode === "dirs"

    return { search, supports } satisfies BackendSearch
  }),
}) {}
