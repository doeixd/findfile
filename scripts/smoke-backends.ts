import { Effect, Layer, Stream } from "effect"
import { BunRuntime } from "@effect/platform-bun"
import { FffFiles } from "#core/backends/fff-files.ts"
import { FffGrep } from "#core/backends/fff-grep.ts"
import { SearchPath } from "#core/schema.ts"

const cwd = SearchPath.make(process.cwd())

const program = Effect.gen(function* () {
  const files = yield* FffFiles
  const grep = yield* FffGrep

  yield* Effect.log("-- fileSearch 'schema' --")
  yield* files
    .search({ text: "schema", mode: "files", cwd, limit: 5 })
    .pipe(
      Stream.take(5),
      Stream.runForEach((r) => Effect.log(`  ${r.relativePath}  score=${r.score}`)),
    )

  yield* Effect.log("-- grep 'Effect.Service' --")
  yield* grep
    .search({ text: "Effect.Service", mode: "content", cwd, grepMode: "plain", limit: 5 })
    .pipe(
      Stream.take(5),
      Stream.runForEach((r) =>
        Effect.log(`  ${r.relativePath}:${r.match?.line} — ${r.match?.preview.trim().slice(0, 80)}`),
      ),
    )
})

const AppLive = Layer.mergeAll(FffFiles.Default, FffGrep.Default)

program.pipe(Effect.scoped, Effect.provide(AppLive), BunRuntime.runMain)
