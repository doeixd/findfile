import { describe, expect, test } from "bun:test"
import {
  buildFilter,
  compileGlobs,
  expandTypes,
  parseModifiedSince,
  pathDepth,
} from "#core/filter.ts"
import { SearchPath, Source, type SearchResult } from "#core/schema.ts"

const makeResult = (rel: string, extras: Partial<SearchResult> = {}): SearchResult => ({
  path: SearchPath.make(`/tmp/${rel}`),
  relativePath: rel,
  kind: "file",
  source: Source.make("fff"),
  ...extras,
})

describe("expandTypes", () => {
  test("known alias expands to its globs", () => {
    expect(expandTypes(["ts"])).toEqual(["*.ts", "*.tsx", "*.mts", "*.cts"])
  })

  test("unknown alias falls back to *.ext", () => {
    expect(expandTypes(["foo"])).toEqual(["*.foo"])
  })

  test("strips leading dot from unknown alias", () => {
    expect(expandTypes([".bar"])).toEqual(["*.bar"])
  })

  test("multiple types concatenate", () => {
    const out = expandTypes(["py", "md"])
    expect(out).toContain("*.py")
    expect(out).toContain("*.md")
  })

  test("case-insensitive alias lookup", () => {
    expect(expandTypes(["TS"])).toEqual(["*.ts", "*.tsx", "*.mts", "*.cts"])
  })
})

describe("compileGlobs", () => {
  test("empty glob list passes everything", () => {
    const m = compileGlobs([])
    expect(m("anything.foo")).toBe(true)
  })

  test("positive pattern gates on match", () => {
    const m = compileGlobs(["*.ts"])
    expect(m("foo.ts")).toBe(true)
    expect(m("foo.js")).toBe(false)
  })

  test("negation excludes", () => {
    const m = compileGlobs(["!*.test.ts"])
    expect(m("foo.ts")).toBe(true)
    expect(m("foo.test.ts")).toBe(false)
  })

  test("positive + negation", () => {
    const m = compileGlobs(["*.ts", "!*.test.ts"])
    expect(m("foo.ts")).toBe(true)
    expect(m("foo.test.ts")).toBe(false)
    expect(m("foo.js")).toBe(false)
  })

  test("windows backslash paths are normalized", () => {
    const m = compileGlobs(["src/**"])
    expect(m("src\\foo\\bar.ts")).toBe(true)
  })
})

describe("pathDepth", () => {
  test.each([
    ["foo.ts", 0],
    ["src/foo.ts", 1],
    ["src/core/foo.ts", 2],
    ["src\\core\\foo.ts", 2],
  ])("%s → %d", (p, expected) => {
    expect(pathDepth(p)).toBe(expected)
  })
})

describe("parseModifiedSince", () => {
  const now = new Date("2026-04-21T12:00:00Z")
  const nowSec = Math.floor(now.getTime() / 1000)

  test("2d → 2 days ago", () => {
    expect(parseModifiedSince("2d", now)).toBe(nowSec - 2 * 86400)
  })

  test("30m → 30 minutes ago", () => {
    expect(parseModifiedSince("30m", now)).toBe(nowSec - 30 * 60)
  })

  test("3h → 3 hours ago", () => {
    expect(parseModifiedSince("3h", now)).toBe(nowSec - 3 * 3600)
  })

  test("1w → 1 week ago", () => {
    expect(parseModifiedSince("1w", now)).toBe(nowSec - 604800)
  })

  test("longform '7 days'", () => {
    expect(parseModifiedSince("7 days", now)).toBe(nowSec - 7 * 86400)
  })

  test("ISO date string", () => {
    const expected = Math.floor(new Date("2026-04-01").getTime() / 1000)
    expect(parseModifiedSince("2026-04-01", now)).toBe(expected)
  })

  test("garbage → null", () => {
    expect(parseModifiedSince("fish", now)).toBeNull()
    expect(parseModifiedSince("2xyz", now)).toBeNull()
  })
})

describe("buildFilter", () => {
  test("no filters → passes everything", () => {
    const f = buildFilter(undefined)
    expect(f(makeResult("foo.ts"))).toBe(true)
  })

  test("glob filter", () => {
    const f = buildFilter({ globs: ["*.ts"] })
    expect(f(makeResult("foo.ts"))).toBe(true)
    expect(f(makeResult("foo.js"))).toBe(false)
  })

  test("type filter", () => {
    const f = buildFilter({ types: ["md"] })
    expect(f(makeResult("README.md"))).toBe(true)
    expect(f(makeResult("foo.ts"))).toBe(false)
  })

  test("glob + type union", () => {
    const f = buildFilter({ globs: ["*.ts"], types: ["md"] })
    expect(f(makeResult("foo.ts"))).toBe(true)
    expect(f(makeResult("README.md"))).toBe(true)
    expect(f(makeResult("foo.js"))).toBe(false)
  })

  test("maxDepth", () => {
    const f = buildFilter({ maxDepth: 1 })
    expect(f(makeResult("foo.ts"))).toBe(true)
    expect(f(makeResult("src/foo.ts"))).toBe(true)
    expect(f(makeResult("src/core/foo.ts"))).toBe(false)
  })

  test("modifiedSinceSec cuts off older results", () => {
    const cutoff = 1_700_000_000
    const f = buildFilter({ modifiedSinceSec: cutoff })
    expect(f(makeResult("a.ts", { modifiedSec: cutoff + 10 }))).toBe(true)
    expect(f(makeResult("b.ts", { modifiedSec: cutoff - 10 }))).toBe(false)
  })

  test("missing modifiedSec is never dropped", () => {
    const f = buildFilter({ modifiedSinceSec: 1_700_000_000 })
    expect(f(makeResult("no-mtime.ts"))).toBe(true)
  })

  test("wordBoundary: matches with non-word neighbors pass", () => {
    const f = buildFilter({ wordBoundary: true })
    const r = makeResult("x.ts", {
      match: {
        line: 1,
        col: 0,
        preview: "const useState = 1",
        ranges: [[6, 14]],
      },
    })
    expect(f(r)).toBe(true)
  })

  test("wordBoundary: partial word-inside match is filtered out", () => {
    const f = buildFilter({ wordBoundary: true })
    const r = makeResult("x.ts", {
      match: {
        line: 1,
        col: 0,
        preview: "useStateful",
        ranges: [[0, 8]], // "useState" inside "useStateful" — word char after
      },
    })
    expect(f(r)).toBe(false)
  })

  test("wordBoundary passes results with no ranges (non-grep hits)", () => {
    const f = buildFilter({ wordBoundary: true })
    expect(f(makeResult("foo.ts"))).toBe(true)
  })
})
