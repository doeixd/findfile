import { Effect } from "effect"
import { FileFinder } from "@ff-labs/fff-bun"
import { FileSystem } from "@effect/platform"
import path from "node:path"
import os from "node:os"
import { BackendInitError } from "../errors.ts"
import type { SearchPath } from "../schema.ts"

const frecencyDbPath = (): string =>
  path.join(os.homedir(), ".local", "share", "findfile", "frecency.db")

const historyDbPath = (): string =>
  path.join(os.homedir(), ".local", "share", "findfile", "history.db")

/**
 * Owns and memoizes `FileFinder` instances per cwd. One finder is
 * shared across `fileSearch`, `directorySearch`, and `grep` so the
 * initial scan only runs once per directory.
 *
 * Passes frecency/history db paths to `FileFinder.create` so query
 * and selection tracking persists across sessions.
 */
export class FffFinder extends Effect.Service<FffFinder>()("findfile/FffFinder", {
  accessors: true,
  scoped: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const cache = new Map<string, FileFinder>()

    const frecencyPath = frecencyDbPath()
    const historyPath = historyDbPath()

    // Ensure parent dirs exist so FileFinder can create dbs
    yield* fs.makeDirectory(path.dirname(frecencyPath), { recursive: true }).pipe(
      Effect.ignore,
    )

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const finder of cache.values()) {
          try {
            finder.destroy()
          } catch {
            // finalization is best-effort
          }
        }
        cache.clear()
      }),
    )

    const get = Effect.fn("FffFinder.get")(function* (cwd: SearchPath) {
      const hit = cache.get(cwd)
      if (hit !== undefined) {
        yield* Effect.logDebug(`FffFinder cache hit for ${cwd}`)
        return hit
      }

      yield* Effect.log(`FffFinder creating finder for ${cwd}`)

      if (!FileFinder.isAvailable()) {
        return yield* Effect.fail(
          new BackendInitError({ backend: "fff", cwd, message: "native library not available" }),
        )
      }

      // fff-bun's JS API accepts these options at runtime even though
      // the TypeScript declarations don't expose them yet.
      const createOpts = {
        basePath: cwd,
        frecencyDbPath: frecencyPath,
        historyDbPath: historyPath,
      }
      let created: { ok: true; value: FileFinder } | { ok: false; error: string }
      try {
        created = (FileFinder.create as (opts: typeof createOpts) => { ok: true; value: FileFinder } | { ok: false; error: string })(
          createOpts,
        )
      } catch (e) {
        return yield* Effect.fail(
          new BackendInitError({ backend: "fff", cwd, message: `create threw: ${String(e)}` }),
        )
      }
      if (!created.ok) {
        return yield* Effect.fail(
          new BackendInitError({ backend: "fff", cwd, message: created.error }),
        )
      }

      yield* Effect.log(`FffFinder created for ${cwd}, waiting for scan...`)

      // Add to cache immediately so getScanProgress can report real
      // progress instead of the generic fallback while waitForScan runs.
      cache.set(cwd, created.value)

      // Wait for initial scan before returning the finder.
      // FileFinder returns 0 results while scanning; without this
      // the first search in the TUI appears broken (empty results).
      const warmup = created.value.waitForScan(30000)
      if (!warmup.ok || !warmup.value) {
        yield* Effect.logWarning(`FffFinder scan warmup timed out for ${cwd}`)
      } else {
        yield* Effect.log(`FffFinder scan complete for ${cwd}`)
      }

      return created.value
    })

    /**
     * Track that a query was executed with a selected file.
     * This updates frecency scores so frequently/recently opened
     * paths rank higher in future searches.
     */
    const trackQuery = (
      cwd: SearchPath,
      query: string,
      selectedPath: string,
    ): Effect.Effect<void, never> =>
      Effect.sync(() => {
        const finder = cache.get(cwd)
        if (finder !== undefined) {
          try {
            ;(finder as { trackQuery: (q: string, p: string) => void }).trackQuery(
              query,
              selectedPath,
            )
          } catch {
            // tracking is best-effort
          }
        }
      })

    interface ScanProgress {
      readonly scannedFilesCount: number
      readonly isScanning: boolean
      readonly isWatcherReady: boolean
      readonly isWarmupComplete: boolean
    }

    const getScanProgress = (cwd: SearchPath): Effect.Effect<ScanProgress> =>
      Effect.gen(function* () {
        const finder = cache.get(cwd)
        if (finder === undefined) {
          yield* Effect.logDebug(`getScanProgress: no finder cached for ${cwd}`)
          return {
            scannedFilesCount: 0,
            isScanning: true,
            isWatcherReady: false,
            isWarmupComplete: false,
          }
        }
        try {
          const raw = (finder as unknown as {
            getScanProgress: () => { ok: true; value: ScanProgress } | { ok: false; error: string }
          }).getScanProgress()
          yield* Effect.logDebug(`getScanProgress for ${cwd}: ok=${raw.ok}`)
          if (raw.ok) {
            yield* Effect.logDebug(
              `getScanProgress for ${cwd}: isScanning=${raw.value.isScanning} warmup=${raw.value.isWarmupComplete} scanned=${raw.value.scannedFilesCount}`,
            )
            return raw.value
          }
          yield* Effect.logWarning(`getScanProgress for ${cwd} failed: ${raw.error}`)
        } catch (e) {
          yield* Effect.logWarning(`getScanProgress for ${cwd} threw: ${String(e)}`)
        }
        return {
          scannedFilesCount: 0,
          isScanning: false,
          isWatcherReady: true,
          isWarmupComplete: true,
        }
      })

    return { get, trackQuery, getScanProgress }
  }),
}) {}
