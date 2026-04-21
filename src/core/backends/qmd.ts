import { Chunk, Effect, Stream } from "effect"
import path from "node:path"
import os from "node:os"
import fs from "node:fs/promises"
import { createHash } from "node:crypto"
import {
  BackendInitError,
  QmdUnavailableError,
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

type QmdModule = typeof import("@tobilu/qmd")
type QMDStore = Awaited<ReturnType<QmdModule["createStore"]>>

const dbPathFor = (cwd: string): string => {
  const hash = createHash("sha1").update(cwd).digest("hex").slice(0, 12)
  return path.join(os.homedir(), ".cache", "findfile", "qmd", `${hash}.sqlite`)
}

const toResult = (cwd: string, hit: {
  displayPath: string
  file: string
  title: string
  bestChunk: string
  bestChunkPos: number
  score: number
}): SearchResult => ({
  path: SearchPath.make(path.resolve(cwd, hit.displayPath)),
  relativePath: hit.displayPath,
  kind: "file",
  score: hit.score,
  match: {
    line: hit.bestChunkPos,
    col: 0,
    preview: hit.bestChunk,
  },
  source: Source.make("qmd"),
})

/**
 * Semantic / hybrid content search backed by `@tobilu/qmd`.
 *
 * Runtime-optional: if the qmd module or its native deps can't load (as
 * will commonly happen in a compiled `bun build --compile` binary), the
 * service surfaces `QmdUnavailableError` via its stream so callers can
 * downgrade gracefully instead of crashing.
 */
export class Qmd extends Effect.Service<Qmd>()("findfile/Qmd", {
  accessors: true,
  scoped: Effect.gen(function* () {
    const stores = new Map<string, QMDStore>()
    let qmdModule: QmdModule | null = null
    let moduleLoadError: string | null = null

    const loadModule = Effect.fn("Qmd.loadModule")(function* () {
      if (qmdModule !== null) return qmdModule
      if (moduleLoadError !== null) {
        return yield* Effect.fail(new QmdUnavailableError({ reason: moduleLoadError }))
      }
      const loaded = yield* Effect.tryPromise({
        try: () => import("@tobilu/qmd"),
        catch: (e) => {
          moduleLoadError = `import failed: ${String(e)}`
          return new QmdUnavailableError({ reason: moduleLoadError })
        },
      })
      qmdModule = loaded
      return loaded
    })

    const getStore = Effect.fn("Qmd.getStore")(function* (cwd: SearchPath) {
      const hit = stores.get(cwd)
      if (hit !== undefined) return hit

      const mod = yield* loadModule()
      const dbPath = dbPathFor(cwd)

      yield* Effect.tryPromise({
        try: () => fs.mkdir(path.dirname(dbPath), { recursive: true }),
        catch: (e) =>
          new BackendInitError({
            backend: "qmd",
            cwd,
            message: `mkdir cache failed: ${String(e)}`,
          }),
      })

      const store = yield* Effect.tryPromise({
        try: () =>
          mod.createStore({
            dbPath,
            config: {
              collections: {
                local: { path: cwd, pattern: "**/*.md" },
              },
            },
          }),
        catch: (e) =>
          new BackendInitError({
            backend: "qmd",
            cwd,
            message: `createStore failed: ${String(e)}`,
          }),
      })

      stores.set(cwd, store)
      return store
    })

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const store of stores.values()) {
          void store.close().catch(() => {})
        }
        stores.clear()
      }),
    )

    const search = (query: SearchQuery): Stream.Stream<SearchResult, SearchError> =>
      Stream.unwrap(
        Effect.gen(function* () {
          const store = yield* getStore(query.cwd)
          const hits = yield* Effect.tryPromise({
            try: () =>
              store.search({
                query: query.text,
                limit: query.limit ?? 30,
                rerank: true,
              }),
            catch: (e) =>
              new SearchExecutionError({
                backend: "qmd",
                query: query.text,
                message: String(e),
              }),
          })
          return Stream.fromChunk(
            Chunk.fromIterable(hits.map((h) => toResult(query.cwd, h))),
          )
        }),
      )

    const supports = (mode: Mode) => mode === "semantic" || mode === "content"

    return { search, supports } satisfies BackendSearch
  }),
}) {}
