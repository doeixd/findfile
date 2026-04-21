import { Effect, Layer, Stream } from "effect"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { QueryRouter } from "#core/query/router.ts"
import { SearchPath } from "#core/schema.ts"

const cwd = SearchPath.make(process.cwd())

const program = Effect.gen(function* () {
  const router = yield* QueryRouter

  yield* Effect.log("-- router files 'schema' --")
  yield* router
    .search({ text: "schema", mode: "files", cwd, limit: 3 })
    .pipe(
      Stream.take(3),
      Stream.runForEach((r) => Effect.log(`  ${r.relativePath} [${r.source}]`)),
    )

  yield* Effect.log("-- router content 'Stream.merge' --")
  yield* router
    .search({ text: "Stream.merge", mode: "content", cwd, grepMode: "plain", limit: 5 })
    .pipe(
      Stream.take(5),
      Stream.runForEach((r) =>
        Effect.log(
          `  ${r.relativePath}:${r.match?.line ?? "-"} [${r.source}]`,
        ),
      ),
    )
})

const AppLive = Layer.mergeAll(QueryRouter.Default).pipe(Layer.provide(BunContext.layer))

program.pipe(Effect.scoped, Effect.provide(AppLive), BunRuntime.runMain)
