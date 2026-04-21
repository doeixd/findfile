import { Duration, Effect, Fiber, Option, Ref, Stream } from "effect"
import type { SearchError } from "../errors.ts"
import type { SearchResult } from "../schema.ts"

/**
 * A per-query runner that debounces incoming search requests.
 *
 * Contract: every call to `run(stream, onResult)` cancels the previous
 * call's in-flight fiber (including its wait + sink), sleeps `wait`,
 * then drains `stream` into `onResult`. `onReset` fires *after* the
 * debounce sleep so stale results stay visible while the user is typing.
 *
 * `dispose` interrupts any live fiber (call on TUI shutdown).
 */
export interface DebouncedRunner {
  readonly run: (
    stream: Stream.Stream<SearchResult, SearchError>,
    onResult: (r: SearchResult) => Effect.Effect<void>,
    onReset: () => Effect.Effect<void>,
  ) => Effect.Effect<void>
  readonly dispose: Effect.Effect<void>
}

export const makeDebouncedRunner = (
  wait: Duration.DurationInput,
): Effect.Effect<DebouncedRunner> =>
  Effect.gen(function* () {
    const slot = yield* Ref.make<Option.Option<Fiber.RuntimeFiber<void, SearchError>>>(
      Option.none(),
    )

    const interruptCurrent = Effect.gen(function* () {
      const current = yield* Ref.getAndSet(slot, Option.none())
      if (Option.isSome(current)) {
        yield* Fiber.interrupt(current.value)
      }
    })

    const run: DebouncedRunner["run"] = (stream, onResult, onReset) =>
      Effect.gen(function* () {
        yield* interruptCurrent
        const body = Effect.gen(function* () {
          yield* Effect.sleep(wait)
          yield* onReset()
          yield* Stream.runForEach(stream, onResult)
        }).pipe(
          Effect.catchAll((err) =>
            Effect.sync(() => {
              // eslint-disable-next-line no-console
              console.error("[findfile] search stream error:", err)
            }),
          ),
        )
        // forkDaemon so the body outlives the runner.run() call
        const fiber = yield* Effect.forkDaemon(body)
        yield* Ref.set(slot, Option.some(fiber))
      })

    return {
      run,
      dispose: interruptCurrent,
    } satisfies DebouncedRunner
  })
