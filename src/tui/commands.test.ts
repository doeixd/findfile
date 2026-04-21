import { describe, expect, test } from "bun:test"
import { dispatchKey, defaultKeymap, parseKeyChord, type CommandContext } from "./commands.ts"
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

describe("parseKeyChord", () => {
  test("matches simple keys", () => {
    const m = parseKeyChord("return")
    expect(m({ name: "return", ctrl: false, alt: false, meta: false, shift: false })).toBe(true)
    expect(m({ name: "escape", ctrl: false, alt: false, meta: false, shift: false })).toBe(false)
  })

  test("matches ctrl combinations", () => {
    const m = parseKeyChord("ctrl+c")
    expect(m({ name: "c", ctrl: true, alt: false, meta: false, shift: false })).toBe(true)
    expect(m({ name: "c", ctrl: false, alt: false, meta: false, shift: false })).toBe(false)
  })

  test("matches alt combinations", () => {
    const m = parseKeyChord("alt+o")
    expect(m({ name: "o", ctrl: false, alt: true, meta: false, shift: false })).toBe(true)
    // OpenTUI conflates alt and meta — alt+o often comes through as meta=true
    expect(m({ name: "o", ctrl: false, alt: false, meta: true, shift: false })).toBe(true)
    // Without alt or meta should not match
    expect(m({ name: "o", ctrl: false, alt: false, meta: false, shift: false })).toBe(false)
  })

  test("matches meta combinations", () => {
    const m = parseKeyChord("meta+o")
    expect(m({ name: "o", ctrl: false, alt: false, meta: true, shift: false })).toBe(true)
    // Should also match when alt is true (treated as equivalent)
    expect(m({ name: "o", ctrl: false, alt: true, meta: false, shift: false })).toBe(true)
  })

  test("matches f-keys", () => {
    const m = parseKeyChord("f3")
    expect(m({ name: "f3", ctrl: false, alt: false, meta: false, shift: false })).toBe(true)
  })
})

describe("dispatchKey", () => {
  test("submit on return", () => {
    const received: SearchResult[][] = []
    const ctx = makeContext({
      selectedResult: () => makeResult("/test"),
      onSubmit: (r) => { received.push([...r] as SearchResult[]) },
    })

    const handled = dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(received.length).toBe(1)
    const firstBatch = received[0]!
    expect(firstBatch.length).toBe(1)
    expect(firstBatch[0]!.path).toBe("/test" as unknown as SearchPath)
  })

  test("submit on enter", () => {
    let submitted = false
    const ctx = makeContext({
      selectedResult: () => makeResult("/test"),
      onSubmit: () => { submitted = true },
    })

    const handled = dispatchKey(
      { name: "enter", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(submitted).toBe(true)
  })

  test("submit on carriage return", () => {
    let submitted = false
    const ctx = makeContext({
      selectedResult: () => makeResult("/test"),
      onSubmit: () => { submitted = true },
    })

    const handled = dispatchKey(
      { name: "\r", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(submitted).toBe(true)
  })

  test("quit on escape", () => {
    let exited = false
    const ctx = makeContext({ onExit: () => { exited = true } })

    const handled = dispatchKey(
      { name: "escape", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(exited).toBe(true)
  })

  test("cycle submit action on alt+o", () => {
    let cycled = false
    const ctx = makeContext({ cycleSubmitAction: () => { cycled = true } })

    const handled = dispatchKey(
      { name: "o", ctrl: false, alt: true, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(cycled).toBe(true)
  })

  test("increase preview width on f3", () => {
    let called = false
    const ctx = makeContext({ increasePreviewWidth: () => { called = true } })

    const handled = dispatchKey(
      { name: "f3", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(called).toBe(true)
  })

  test("decrease preview width on f4", () => {
    let called = false
    const ctx = makeContext({ decreasePreviewWidth: () => { called = true } })

    const handled = dispatchKey(
      { name: "f4", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(called).toBe(true)
  })

  test("user keymap overrides default", () => {
    let exited = false
    let cycled = false
    const ctx = makeContext({
      onExit: () => { exited = true },
      cycleSubmitAction: () => { cycled = true },
    })

    const handled = dispatchKey(
      { name: "escape", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: { escape: "cycleSubmitAction" }, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(exited).toBe(false)
    expect(cycled).toBe(true)
  })

  test("returns false for unbound keys", () => {
    const ctx = makeContext()

    const handled = dispatchKey(
      { name: "z", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(false)
  })

  test("submit submits marked results when marks exist", () => {
    const received: SearchResult[][] = []
    const ctx = makeContext({
      marks: () => new Set(["/a", "/b"]),
      markedResults: () => [makeResult("/a"), makeResult("/b")],
      selectedResult: () => makeResult("/c"),
      onSubmit: (r) => { received.push([...r] as SearchResult[]) },
    })

    const handled = dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(received.length).toBe(1)
    const firstBatch = received[0]!
    expect(firstBatch.length).toBe(2)
    expect(firstBatch[0]!.path).toBe("/a" as unknown as SearchPath)
    expect(firstBatch[1]!.path).toBe("/b" as unknown as SearchPath)
  })

  test("submit with no selection does nothing", () => {
    let submitted = false
    const ctx = makeContext({
      selectedResult: () => null,
      marks: () => new Set(),
      markedResults: () => [],
      onSubmit: () => { submitted = true },
    })

    const handled = dispatchKey(
      { name: "return", ctrl: false, alt: false, meta: false, shift: false },
      { context: ctx, keymap: {}, defaultKeymap },
    )

    expect(handled).toBe(true)
    expect(submitted).toBe(false)
  })
})
