import { Effect, Layer } from "effect"
import { BunContext, BunRuntime } from "@effect/platform-bun"
import { ConfigService } from "#core/config.ts"
import { Gitignore } from "#core/gitignore.ts"

const program = Effect.gen(function* () {
  const config = yield* ConfigService
  const gitignore = yield* Gitignore

  const configResult = yield* config.load(process.cwd(), {
    extraIgnore: ["dist/**", "*.log"],
  })
  const resolved = configResult.resolved
  yield* Effect.log("resolved config", resolved)

  const matcher = yield* gitignore.load(process.cwd(), resolved.ignore.extra)
  for (const p of [
    "src/core/schema.ts",
    "node_modules/foo/index.js",
    "dist/bundle.js",
    "app.log",
    "README.md",
  ]) {
    yield* Effect.log(`  ${p} → ignored=${matcher.isIgnored(p)}`)
  }
})

const AppLive = Layer.mergeAll(ConfigService.Default, Gitignore.Default).pipe(
  Layer.provide(BunContext.layer),
)

program.pipe(Effect.scoped, Effect.provide(AppLive), BunRuntime.runMain)
