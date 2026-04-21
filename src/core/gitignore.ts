import { Effect } from "effect"
import { FileSystem } from "@effect/platform"
import ignore, { type Ignore } from "ignore"
import path from "node:path"

/**
 * Reads the `.gitignore` chain walking up from {@link cwd} to the
 * filesystem root, compiling the combined pattern list into an
 * {@link Ignore} instance. Extras from config are appended last so
 * they always take precedence.
 *
 * All paths passed to {@link GitignoreMatcher.isIgnored} must be
 * relative to {@link cwd}; absolute paths are normalized internally.
 */
export interface GitignoreMatcher {
  readonly cwd: string
  readonly isIgnored: (relativeOrAbsolutePath: string) => boolean
}

const walkUp = (start: string): string[] => {
  const out: string[] = []
  let current = path.resolve(start)
  while (true) {
    out.push(current)
    const parent = path.dirname(current)
    if (parent === current) return out
    current = parent
  }
}

const toRelative = (cwd: string, p: string): string => {
  if (!path.isAbsolute(p)) return p.replaceAll("\\", "/")
  const rel = path.relative(cwd, p)
  return rel.replaceAll("\\", "/")
}

export class Gitignore extends Effect.Service<Gitignore>()("findfile/Gitignore", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const load = Effect.fn("Gitignore.load")(function* (
      cwd: string,
      extra: readonly string[] = [],
    ) {
      const ig: Ignore = ignore({ allowRelativePaths: true })

      for (const dir of walkUp(cwd).reverse()) {
        const gi = path.join(dir, ".gitignore")
        const present = yield* fs.exists(gi).pipe(Effect.orElseSucceed(() => false))
        if (present) {
          const body = yield* fs.readFileString(gi).pipe(
            Effect.orElseSucceed(() => ""),
          )
          if (body.length > 0) ig.add(body)
        }

        const fi = path.join(dir, ".findfileignore")
        const fiPresent = yield* fs.exists(fi).pipe(Effect.orElseSucceed(() => false))
        if (fiPresent) {
          const body = yield* fs.readFileString(fi).pipe(
            Effect.orElseSucceed(() => ""),
          )
          if (body.length > 0) ig.add(body)
        }
      }

      if (extra.length > 0) ig.add([...extra])

      const matcher: GitignoreMatcher = {
        cwd,
        isIgnored: (p) => {
          const rel = toRelative(cwd, p)
          if (rel.length === 0 || rel.startsWith("..")) return false
          return ig.ignores(rel)
        },
      }
      return matcher
    })

    const loadFindfileOnly = Effect.fn("Gitignore.loadFindfileOnly")(function* (
      cwd: string,
    ) {
      const ig: Ignore = ignore({ allowRelativePaths: true })

      for (const dir of walkUp(cwd).reverse()) {
        const fi = path.join(dir, ".findfileignore")
        const present = yield* fs.exists(fi).pipe(Effect.orElseSucceed(() => false))
        if (present) {
          const body = yield* fs.readFileString(fi).pipe(
            Effect.orElseSucceed(() => ""),
          )
          if (body.length > 0) ig.add(body)
        }
      }

      const matcher: GitignoreMatcher = {
        cwd,
        isIgnored: (p) => {
          const rel = toRelative(cwd, p)
          if (rel.length === 0 || rel.startsWith("..")) return false
          return ig.ignores(rel)
        },
      }
      return matcher
    })

    return { load, loadFindfileOnly }
  }),
}) {}
