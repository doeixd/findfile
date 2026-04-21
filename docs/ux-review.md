# findfile UX Review

A holistic review of the TUI, CLI, and integration surfaces. Items are
rated **P0** (fix before next release), **P1** (significant UX win), or
**P2** (nice-to-have polish).

---

## 1. TUI Experience

### P0 — No visible feedback during first scan
`fff-bun` runs `waitForScan(10_000)` on first launch per cwd. During
this time the TUI shows "Type to search…" but the user has typed
nothing — it looks frozen. A scan progress indicator (or even just
"indexing…") would eliminate the "is this broken?" moment.

**Fix:** wire `finder.isScanning()` + `getScanProgress()` into the
status bar. Show `indexing {pct}%` when `isScanning()` is true.

### P0 — Query input has no history
Every session starts with an empty query. Users repeatedly search for
the same things. fff-bun already has `trackQuery()` — we should expose
a query history popup (Up arrow when input is focused, or Ctrl+R).

### P1 — Results list doesn't scroll with selection
The selected row can go off-screen if results exceed the pane height.
There's no `scrollbox` wrapper around the list.

**Fix:** wrap the `<For>` in a `<scrollbox>` that tracks the selected
index. Or at minimum add `overflow="hidden"` to the result rows so
unselected rows don't push content down.

### P1 — No result count / progress while streaming
`Stream.runForEach` pushes results incrementally, but the user doesn't
know if more are coming. The status bar shows `searching "foo" (files)`
but no hit count. Once results start arriving, the status should say
`42 results (searching…)` so the user knows they can stop waiting.

### P1 — Preview pane shows no line numbers
When viewing a file preview, there's no way to know which line you're
looking at. The `PreviewSlice` carries `startLine` but it's never
rendered.

**Fix:** render a `<line_number>` element alongside `<code>`, or prefix
each line with a dimmed line number in the text.

### P1 — No preview scrolling
The `scrollPreview` command exists in the registry but is a no-op.
Users can't scroll the preview pane to see more context around a match.

**Fix:** store a `previewScroll` signal and offset the rendered content,
or use a `<scrollbox>` with a ref that the command can manipulate.

### P1 — Selected result loses context on re-query
When the user changes their query, `setResults([])` resets everything.
If they had selected result #5, the selection snaps back to 0. If the
new query is just an edit (e.g. "foo" → "foobar"), this feels jarring.

**Fix:** preserve selection index when the new result set contains the
same path at a similar position. Or at least restore to 0 smoothly
rather than leaving the old preview visible momentarily.

### P2 — Theme picker could show a preview swatch
The theme picker lists names but gives no hint what they look like.
A small colored swatch (e.g. `●` in the accent color) next to each name
would help users choose without cycling through all 35.

### P2 — Results list could show file icons or type indicators
A small indicator (📄 📁) or language color dot next to each result
would make scanning faster. This is what makes `fzf` with `fd` feel
richer than plain lists.

---

## 2. CLI & Non-TUI Experience

### P0 — `--no-tui` with no query hangs on stdin
If the user runs `findfile --no-tui` with no positional arg and no
piped stdin, the app hangs waiting for `Bun.stdin.text()`. This is an
easy trap.

**Fix:** detect `!stdinIsTty && !pathsFromStdin` but stdin is empty,
then print a usage hint and exit with code 2.

### P0 — `--format line` on files/dirs mode is confusing
When mode is `files` or `dirs`, matches don't have `match.line`. The
formatter falls back to just printing the path, but the user asked for
`line` format expecting `path:line:col`. Silent fallback is confusing.

**Fix:** warn to stderr: `--format line requires content mode; falling
back to path format`.

### P1 — No `--init` flag to scaffold config
Users have to manually create `findfile.config.toml` or copy from docs.
An `findfile init` subcommand that writes a starter config (with
comments) would dramatically lower the barrier.

### P1 — `--config` flag exists but isn't wired
`Command.make` defines `config: configOpt` but `args.config` is never
used in the handler. The user can pass `--config ./my.toml` and it
does nothing.

**Fix:** pass the config path into `ConfigService.load()`.

### P1 — `doctor` doesn't test actual search
`findfile doctor` prints version numbers but never attempts a search.
It can't diagnose "fff-bun loads but crashes on first query" or "qmd
works but returns no results".

**Fix:** add a smoke search step: `finder.fileSearch(".", {pageIndex:0,
pageSize:1})` and report ok/fail.

### P1 — Exit codes aren't documented
Grep-style exit codes (0=hit, 1=no hit, 2=error) are implemented but
not mentioned in `--help` or docs. Scripts can't rely on behavior they
don't know exists.

**Fix:** add to `docs/commands.md` and consider printing a note when
`--no-tui` exits 1.

### P2 — `--limit` defaults differ between TUI and CLI
TUI defaults to 200, CLI defaults to no limit. This is sensible
(performance vs completeness) but unexpected. A user who switches from
`findfile foo` to `findfile foo | head` might wonder why they see more
in the pipe.

**Fix:** document the divergence explicitly.

---

## 3. Search & Filtering

### P1 — No `--hidden` / `--no-ignore` parity
The CLI args are defined (`noGitignoreOpt`) but `--hidden` isn't
exposed. fff-bun supports `hidden` in search options; we just don't
wire it. Users who want dotfiles have to use `--glob '.*'` which is
awkward.

**Fix:** add `--hidden` flag and pass through to `SearchFilters`.

### P1 — `--type` aliases are just raw strings
`--type ts` doesn't actually check the file extension. It passes `ts`
as a filter but `fff-bun` doesn't know what `ts` means — it expects
file extension patterns. The `types` field in `SearchFilters` is
treated as a pass-through.

**Fix:** maintain a mapping `ts → ['*.ts', '*.tsx', '*.mts', '*.cts']`
and expand before passing to the backend. Or document that `--type`
expects glob patterns.

### P1 — No search-in-preview (fzf's best feature)
fzf lets you search within the preview pane with `?` then type to
filter. findfile's preview is read-only. For large files, this is a
major gap.

**Fix:** not trivial, but a `Ctrl+F` in preview that highlights matches
within the preview text would be a start.

### P2 — `--depth` not wired to fff-bun
`SearchFilters.maxDepth` exists but `fff-files.ts` and `fff-grep.ts`
don't pass it to the backend. fff-bun likely supports `maxDepth` in
`SearchOptions`.

---

## 4. Discoverability & Onboarding

### P0 — No README
There is no `README.md` in the repo. A user who finds this on GitHub
has no quickstart, no screenshot, no installation instructions.

**Fix:** write a `README.md` with: install (bun), quickstart (3
examples), TUI screenshot (ASCII or image), config example, and shell
integration one-liner.

### P0 — First launch is intimidating
The TUI opens to an empty screen with a blinking cursor and no hints.
The status bar shows keys, but a new user doesn't know what modes are,
what marking means, or that `?` shows help.

**Fix:** show a transient "welcome" message on first run (stored in a
`~/.local/share/findfile/first-run` sentinel). Something like:
```
Type to search files · Tab switches mode · ? for help
```

### P1 — `--help` is auto-generated by `@effect/cli`
It's accurate but dry. There's no "examples" section, no "see also",
no pointer to the docs.

**Fix:** `@effect/cli` supports `Command.withDescription`. Add rich
descriptions with examples.

### P1 — No `man` page or `--help-themes`
Users who want to know what themes are available have to open the
docs or browse the source. A `--list-themes` flag or a man page
would help.

### P2 — TUI mode badge doesn't explain modes
The `[files]` badge in the query input is clickable (in theory) but
has no tooltip. A new user sees `[files]` and doesn't know it can
cycle to `content`, `dirs`, or `semantic`.

**Fix:** on first mode cycle, show a toast: `Switched to content mode
— searches file contents`.

---

## 5. Integration & Ecosystem

### P1 — No editor plugin / LSP
`fzf` succeeded partly because it has Vim/Neovim plugins. findfile is
a pure CLI tool with no editor integration. An `:Findfile` command for
Neovim that opens the TUI in a floating window and feeds results back
would be a killer feature.

### P1 — Shell completions not generated
`@effect/cli` can generate shell completions (bash/zsh/fish). We
should expose `findfile completions bash` and document it.

### P1 — `--paths-from` is powerful but undocumented in `--help`
The flag exists and works, but the `--help` text doesn't mention the
`-` stdin syntax or give examples.

### P2 — No `git` integration beyond gitignore
`fzf` users often integrate with `git status`, `git log`, etc.
`findfile` has no `--git-status` filter or `--staged-only` flag. For
a dev tool, git-aware search is a natural extension.

---

## 6. Accessibility & Robustness

### P1 — No high-contrast or reduced-motion mode
Some users need high contrast (WCAG AAA) or reduced motion (no smooth
scrolling). Our theme system can support this, but there's no preset
and no `--accessibility` flag.

### P1 — Preview pane can crash on binary files
`fs.readFileString()` on a binary file will produce garbage. There's
no MIME type check. A user searching in `node_modules` might hit a
`.wasm` or `.png`.

**Fix:** check if the file is text (first 1KB has no null bytes) and
show `(binary file)` instead of garbage.

### P2 — No session restore
If the terminal is resized or the SSH connection drops, the user loses
their query, selection, and marks. A simple session file
(`~/.cache/findfile/session.json`) that auto-saves query + mode would
make restarts feel seamless.

---

## 7. Performance

### P1 — Preview reads entire file into memory
`fs.readFileString(path)` reads the whole file just to show 36 lines.
For a 100MB log file, this is wasteful.

**Fix:** use `fs.readFile` to get a `Uint8Array`, scan for line breaks
around the target line, and only decode that slice. Or use Bun's
`file.text()` with streaming.

### P1 — No debounce on preview loading
Every arrow-key press triggers a new `preview.read()` Effect. Rapid
navigation creates a pile of parallel file reads.

**Fix:** debounce preview loading by ~50ms, cancelling the old read
when a new selection arrives.

### P2 — Results stream has no backpressure
`Stream.runForEach` pushes every result into `setResults`. For 10,000
results, Solid will re-render the list 10,000 times.

**Fix:** batch results into chunks (e.g. every 50ms or every 20 items)
before calling `setResults`.

---

## Summary — Priority Roadmap

### This week (P0)
1. Add indexing progress indicator to status bar
2. Add query history (arrow-up in input)
3. Fix `--config` flag wiring
4. Write `README.md`
5. Add first-run welcome message
6. Fix `--no-tui` stdin hang
7. Add `--format line` mode mismatch warning

### Next week (P1)
1. Scroll results list with selection
2. Add preview line numbers
3. Implement preview scrolling
4. Add `findfile init` subcommand
5. Add `--hidden` flag
6. Add `--type` alias expansion
7. Debounce preview reads
8. Add smoke test to `doctor`
9. Generate shell completions
10. Binary file guard in preview

### Later (P2)
1. Theme picker swatches
2. File type icons in results
3. Session restore
4. Search-in-preview
5. `--git-status` filter
6. Editor plugins
7. High-contrast accessibility preset
8. Batch result updates for performance
