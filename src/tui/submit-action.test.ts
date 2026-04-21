import { describe, expect, test } from "bun:test"
import {
  cycleSubmitAction,
  getActionLabel,
  getSubmitOutcome,
  SUBMIT_ACTIONS,
  type SubmitAction,
} from "./submit-action.ts"
import type { SearchResult, SearchPath, Source } from "#core/schema.ts"

const makeResult = (path: string): SearchResult => ({
  path: path as unknown as SearchPath,
  relativePath: path,
  kind: "file",
  score: 1,
  match: { line: 1, col: 1, preview: "", ranges: [] },
  source: "fff" as unknown as Source,
})

describe("cycleSubmitAction", () => {
  test("cycles forward through actions", () => {
    expect(cycleSubmitAction("print", false)).toBe("open")
    expect(cycleSubmitAction("open", false)).toBe("copy")
    expect(cycleSubmitAction("copy", false)).toBe("navigate")
    expect(cycleSubmitAction("navigate", false)).toBe("print")
  })

  test("skips custom when not available", () => {
    expect(cycleSubmitAction("navigate", false)).toBe("print")
  })

  test("includes custom when available", () => {
    expect(cycleSubmitAction("navigate", true)).toBe("custom")
    expect(cycleSubmitAction("custom", true)).toBe("print")
  })

  test("handles unknown current gracefully", () => {
    expect(cycleSubmitAction("print" as never, false)).toBe("open")
  })
})

describe("getActionLabel", () => {
  test("returns human-readable labels", () => {
    expect(getActionLabel({ type: "print" })).toBe("Print")
    expect(getActionLabel({ type: "open" })).toBe("Open")
    expect(getActionLabel({ type: "copy" })).toBe("Copy")
    expect(getActionLabel({ type: "navigate" })).toBe("Navigate")
    expect(getActionLabel({ type: "custom", customCmd: "foo" })).toBe("Custom")
  })
})

describe("getSubmitOutcome", () => {
  test("print action returns print outcome", () => {
    const action: SubmitAction = { type: "print" }
    const outcome = getSubmitOutcome(action, [makeResult("/foo")])
    expect(outcome.type).toBe("print")
  })

  test("open action returns spawn outcome with xdg-open", () => {
    const action: SubmitAction = { type: "open" }
    const outcome = getSubmitOutcome(action, [makeResult("/foo")])
    expect(outcome.type).toBe("spawn")
    if (outcome.type === "spawn") {
      const expected = process.platform === "win32"
        ? ["explorer", "/foo"]
        : process.platform === "darwin"
          ? ["open", "/foo"]
          : ["xdg-open", "/foo"]
      expect(outcome.cmd).toEqual(expected)
    }
  })

  test("copy action returns osc52 outcome", () => {
    const action: SubmitAction = { type: "copy" }
    const outcome = getSubmitOutcome(action, [makeResult("/foo"), makeResult("/bar")])
    expect(outcome.type).toBe("osc52")
    if (outcome.type === "osc52") {
      expect(outcome.text).toBe("/foo\n/bar")
    }
  })

  test("navigate action returns dir for file", () => {
    const action: SubmitAction = { type: "navigate" }
    const outcome = getSubmitOutcome(action, [makeResult("/home/user/file.txt")])
    expect(outcome.type).toBe("navigate")
    if (outcome.type === "navigate") {
      expect(outcome.dir).toBe("/home/user")
    }
  })

  test("custom action replaces {path} token", () => {
    const action: SubmitAction = { type: "custom", customCmd: "code {path}" }
    const outcome = getSubmitOutcome(action, [makeResult("/foo"), makeResult("/bar")])
    expect(outcome.type).toBe("spawn")
    if (outcome.type === "spawn") {
      const shell = process.platform === "win32" ? "cmd" : "sh"
      const flag = process.platform === "win32" ? "/c" : "-c"
      expect(outcome.cmd[0]).toBe(shell)
      expect(outcome.cmd[1]).toBe(flag)
      expect(outcome.cmd[2]).toBe("code /foo /bar")
    }
  })

  test("custom action appends path when no token", () => {
    const action: SubmitAction = { type: "custom", customCmd: "git add" }
    const outcome = getSubmitOutcome(action, [makeResult("/foo")])
    expect(outcome.type).toBe("spawn")
    if (outcome.type === "spawn") {
      expect(outcome.cmd[2]).toBe("git add /foo")
    }
  })

  test("falls back to print on empty results", () => {
    const action: SubmitAction = { type: "open" }
    const outcome = getSubmitOutcome(action, [])
    expect(outcome.type).toBe("print")
  })
})
