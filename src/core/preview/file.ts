import { Effect } from "effect"
import { FileSystem } from "@effect/platform"
import { PreviewReadError } from "../errors.ts"

const MAX_PREVIEW_BYTES = 256 * 1024 // 256 KB
const MAX_PREVIEW_LINES = 500

/**
 * A fixed-size slice of a file centered around a hit line. Line numbers
 * are 1-based to match grep output. `text` is already newline-joined.
 */
export interface PreviewSlice {
  readonly path: string
  readonly text: string
  readonly startLine: number
  readonly hitLine: number | null
  readonly isDirectory: boolean
  readonly isBinary: boolean
}

/**
 * Reads a file and returns a window of lines around `line`. When `line`
 * is null (file-mode hit without a line), returns the head of the file.
 *
 * Safety guards:
 * - Skips files larger than 256 KB (returns truncation notice)
 * - Detects binary files (null bytes)
 * - Handles invalid UTF-8 gracefully
 */
export class PreviewService extends Effect.Service<PreviewService>()("findfile/PreviewService", {
  accessors: true,
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    const read = Effect.fn("PreviewService.read")(function* (
      filePath: string,
      line: number | null,
      before = 5,
      after = 30,
    ) {
      const stat = yield* fs.stat(filePath).pipe(
        Effect.mapError((e) => new PreviewReadError({ path: filePath, message: String(e) })),
      )

      if (stat.type === "Directory") {
        const entries = yield* fs.readDirectory(filePath).pipe(
          Effect.mapError((e) => new PreviewReadError({ path: filePath, message: String(e) })),
        )
        const names = entries.sort()
        const slice: PreviewSlice = {
          path: filePath,
          text: names.length > 0 ? names.join("\n") : "(empty directory)",
          startLine: 1,
          hitLine: null,
          isDirectory: true,
          isBinary: false,
        }
        return slice
      }

      const sizeNum = (stat.size as unknown as number)
      if (sizeNum > MAX_PREVIEW_BYTES) {
        const slice: PreviewSlice = {
          path: filePath,
          text: `(file too large: ${(sizeNum / 1024).toFixed(0)} KB; max ${MAX_PREVIEW_BYTES / 1024} KB)`,
          startLine: 1,
          hitLine: null,
          isDirectory: false,
          isBinary: false,
        }
        return slice
      }

      // Read as Buffer first to detect binary files
      const buffer = yield* fs.readFile(filePath).pipe(
        Effect.mapError(
          (e) => new PreviewReadError({ path: filePath, message: String(e) }),
        ),
      )

      // Binary detection: null bytes
      const hasNull = buffer.includes(0)
      if (hasNull) {
        const slice: PreviewSlice = {
          path: filePath,
          text: "(binary file)",
          startLine: 1,
          hitLine: null,
          isDirectory: false,
          isBinary: true,
        }
        return slice
      }

      const body = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        catch: () => "(file contains invalid UTF-8)",
      })

      const lines = body.split(/\r?\n/)
      if (lines.length > MAX_PREVIEW_LINES) {
        lines.length = MAX_PREVIEW_LINES
        lines.push("(truncated)")
      }

      let startIdx: number
      let endIdx: number
      if (line === null) {
        startIdx = 0
        endIdx = Math.min(lines.length, before + after + 1)
      } else {
        const hitIdx = Math.max(0, line - 1)
        startIdx = Math.max(0, hitIdx - before)
        endIdx = Math.min(lines.length, hitIdx + after + 1)
      }

      const slice: PreviewSlice = {
        path: filePath,
        text: lines.slice(startIdx, endIdx).join("\n"),
        startLine: startIdx + 1,
        hitLine: line,
        isDirectory: false,
        isBinary: false,
      }
      return slice
    })

    return { read }
  }),
}) {}
