import { describe, expect, test } from "bun:test"
import { dispatchKey, defaultKeymap } from "./commands.ts"
import { getSubmitOutcome } from "./submit-action.ts"
import type { CommandContext } from "./commands.ts"
import type { Mode, SearchResult, SearchPath, Source } from "#core/schema.ts"

const makeResult = (path: string): SearchResult => ({
  path: path as unknown as SearchPath,
  relativePath: path,
  kind: "file",
  score: 1,
  match: { line: 1, col: 1, preview: "", ranges: [] },
  source: "fff" as unknown as Source,
})

const makeContext = (overrides: Partial<CommandContext> = {}): CommandContext => ({
  query: () => "",
  setQuery: () => {},
  mode: () => "files" as Mode,
  setMode: () => {},
  results: () => [],
  selected: () => 0,
  setSelected: () => {},
  marks: () => new Set(),
  setMarks: () => {},
  preview: () => null,
  cycleMode: () => {},
  cycleModeReverse: () => {},
  moveSelection: () => {},
  toggleMark: () => {},
  markedResults: () => [],
  selectedResult: () => null,
  scrollPreview: () => {},
  onExit: () => {},
  onSubmit: () => {},
  ...overrides,
})

describe("Full submit flow", () => {
  test("Enter with selection → submit called → print outcome", () => {
    const results: SearchResult[][] = []
    const ctx = makeContext({
      selectedResult: () => makeResult("/home/user/src/main.ts"),
      onSubmit: (r) => results.push([...r] as SearchResult[]),
    })

    const handled = dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(results.length).toBe(1)
    const firstResult = results[0]!
    expect(firstResult.length).toBe(1)

    const outcome = getSubmitOutcome({ type: "print" }, firstResult)
    expect(outcome.type).toBe("print")
  })

  test("Enter with marks → submit all marked → open outcome", () => {
    const results: SearchResult[][] = []
    const ctx = makeContext({
      marks: () => new Set(["/a.ts", "/b.ts"]),
      markedResults: () => [makeResult("/a.ts"), makeResult("/b.ts")],
      selectedResult: () => makeResult("/c.ts"),
      onSubmit: (r) => results.push([...r] as SearchResult[]),
    })

    dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(results.length).toBe(1)
    const markedResult = results[0]!
    expect(markedResult.length).toBe(2)

    const outcome = getSubmitOutcome({ type: "open" }, markedResult)
    expect(outcome.type).toBe("spawn")
    if (outcome.type === "spawn") {
      const expectedCmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open"
      expect(outcome.cmd[0]).toBe(expectedCmd)
      expect(outcome.cmd[1]).toBe("/a.ts")
    }
  })

  test("Enter → copy outcome produces OSC 52 payload", () => {
    const results: SearchResult[][] = []
    const ctx = makeContext({
      selectedResult: () => makeResult("/secret.txt"),
      onSubmit: (r) => results.push([...r] as SearchResult[]),
    })

    dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    const copyResult = results[0]!
    const outcome = getSubmitOutcome({ type: "copy" }, copyResult)
    expect(outcome.type).toBe("osc52")
    if (outcome.type === "osc52") {
      expect(outcome.text).toBe("/secret.txt")
      // Verify base64 encoding works
      const b64 = Buffer.from(outcome.text, "utf-8").toString("base64")
      expect(b64).toBe(Buffer.from("/secret.txt").toString("base64"))
    }
  })

  test("Enter → navigate outcome resolves to parent dir", () => {
    const results: SearchResult[][] = []
    const ctx = makeContext({
      selectedResult: () => makeResult("/home/user/projects/app/src/index.ts"),
      onSubmit: (r) => results.push([...r] as SearchResult[]),
    })

    dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    const navResult = results[0]!
    const outcome = getSubmitOutcome({ type: "navigate" }, navResult)
    expect(outcome.type).toBe("navigate")
    if (outcome.type === "navigate") {
      expect(outcome.dir).toBe("/home/user/projects/app/src")
    }
  })

  test("Enter → custom outcome builds correct shell command", () => {
    const results: SearchResult[][] = []
    const ctx = makeContext({
      selectedResult: () => makeResult("/file.txt"),
      onSubmit: (r) => results.push([...r] as SearchResult[]),
    })

    dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    const customResult = results[0]!
    const outcome = getSubmitOutcome(
      { type: "custom", customCmd: "git add {path}" },
      customResult,
    )
    expect(outcome.type).toBe("spawn")
    if (outcome.type === "spawn") {
      const shell = process.platform === "win32" ? "cmd" : "sh"
      const flag = process.platform === "win32" ? "/c" : "-c"
      expect(outcome.cmd[0]).toBe(shell)
      expect(outcome.cmd[1]).toBe(flag)
      expect(outcome.cmd[2]).toBe("git add /file.txt")
    }
  })

  test("Escape → onExit called, no submit, no outcome", () => {
    let exited = false
    let submitted = false
    const ctx = makeContext({
      onExit: () => { exited = true },
      onSubmit: () => { submitted = true },
    })

    const handled = dispatchKey(
      { name: "escape", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(exited).toBe(true)
    expect(submitted).toBe(false)
  })
})
