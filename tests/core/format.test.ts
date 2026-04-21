import { describe, expect, test } from "bun:test"
import {
  formatResult,
  resolveColor,
  type ColorMode,
} from "#core/format.ts"
import { SearchPath, Source, type SearchResult } from "#core/schema.ts"

const fileHit: SearchResult = {
  path: SearchPath.make("/tmp/foo/bar.ts"),
  relativePath: "bar.ts",
  kind: "file",
  source: Source.make("fff"),
}

const grepHit: SearchResult = {
  path: SearchPath.make("/tmp/foo/bar.ts"),
  relativePath: "bar.ts",
  kind: "file",
  source: Source.make("fff-grep"),
  match: {
    line: 42,
    col: 10,
    preview: "  const useState = 1",
    ranges: [[8, 16]],
  },
}

const ESC = "\x1b"
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "")

describe("resolveColor", () => {
  test.each<[ColorMode, boolean, boolean]>([
    ["always", true, true],
    ["always", false, true],
    ["never", true, false],
    ["never", false, false],
    ["auto", true, true],
    ["auto", false, false],
  ])("%s + tty=%s → %s", (mode, tty, expected) => {
    expect(resolveColor(mode, tty)).toBe(expected)
  })
})

describe("formatResult - path format", () => {
  test("no color, no match", () => {
    expect(formatResult(fileHit, "path", false)).toBe("bar.ts\n")
  })

  test("no color, grep hit — still just path", () => {
    expect(formatResult(grepHit, "path", false)).toBe("bar.ts\n")
  })

  test("color wraps path in ANSI", () => {
    const out = formatResult(fileHit, "path", true)
    expect(stripAnsi(out)).toBe("bar.ts\n")
    expect(out).toContain(ESC)
  })
})

describe("formatResult - null format", () => {
  test("uses \\0 terminator, no newline", () => {
    expect(formatResult(fileHit, "null", false)).toBe("bar.ts\0")
  })

  test("null format ignores color", () => {
    expect(formatResult(fileHit, "null", true)).toBe("bar.ts\0")
  })
})

describe("formatResult - json format", () => {
  test("emits JSONL with full SearchResult", () => {
    const out = formatResult(grepHit, "json", false)
    expect(out.endsWith("\n")).toBe(true)
    const parsed = JSON.parse(out.trim())
    expect(parsed.relativePath).toBe("bar.ts")
    expect(parsed.match.line).toBe(42)
    expect(parsed.match.ranges).toEqual([[8, 16]])
  })

  test("json never emits ANSI", () => {
    const out = formatResult(grepHit, "json", true)
    expect(out).not.toContain(ESC)
  })
})

describe("formatResult - line format", () => {
  test("no match → falls back to path", () => {
    expect(formatResult(fileHit, "line", false)).toBe("bar.ts\n")
  })

  test("plain — path:line:col<TAB>preview, indentation preserved", () => {
    expect(formatResult(grepHit, "line", false)).toBe(
      "bar.ts:42:10\t  const useState = 1\n",
    )
  })

  test("color — stripping ANSI yields the plain line", () => {
    const out = formatResult(grepHit, "line", true)
    expect(stripAnsi(out)).toBe("bar.ts:42:10\t  const useState = 1\n")
    expect(out).toContain(ESC)
  })

  test("color — highlight wraps the exact matched substring", () => {
    const out = formatResult(grepHit, "line", true)
    // Matched substring "useState" sits at preview[8..16] untrimmed.
    const useStateIdx = out.indexOf("useState")
    const before = out.slice(0, useStateIdx)
    // The char just before "useState" should be an opening ANSI sequence,
    // and the ANSI should close right after the 8 chars.
    expect(before.endsWith("\x1b[31m")).toBe(true)
    const after = out.slice(useStateIdx + "useState".length)
    expect(after.startsWith("\x1b[0m")).toBe(true)
  })
})

describe("formatResult - edge cases", () => {
  test("empty ranges does not crash, no highlight", () => {
    const hit: SearchResult = {
      ...grepHit,
      match: { line: 1, col: 0, preview: "hi", ranges: [] },
    }
    const out = formatResult(hit, "line", true)
    expect(stripAnsi(out)).toBe("bar.ts:1:0\thi\n")
  })

  test("range past preview length is clamped", () => {
    const hit: SearchResult = {
      ...grepHit,
      match: { line: 1, col: 0, preview: "short", ranges: [[2, 999]] },
    }
    const out = formatResult(hit, "line", true)
    expect(stripAnsi(out)).toBe("bar.ts:1:0\tshort\n")
  })

  test("overlapping ranges skip the overlap", () => {
    const hit: SearchResult = {
      ...grepHit,
      match: {
        line: 1,
        col: 0,
        preview: "abcdef",
        ranges: [
          [1, 4],
          [2, 3], // fully inside previous, dropped
        ],
      },
    }
    const out = formatResult(hit, "line", true)
    expect(stripAnsi(out)).toBe("bar.ts:1:0\tabcdef\n")
  })

  test("missing ranges field is treated like no-highlight", () => {
    const hit: SearchResult = {
      ...grepHit,
      match: { line: 1, col: 0, preview: "plain" },
    }
    const out = formatResult(hit, "line", true)
    expect(stripAnsi(out)).toBe("bar.ts:1:0\tplain\n")
  })
})
