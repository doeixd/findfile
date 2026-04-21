# Shell & Editor Integration

`findfile` is designed to compose with your shell. These wrappers turn the TUI into a fast "pick → open" loop for your editor.

## Bash / Zsh

Add to `~/.bashrc` or `~/.zshrc`:

```bash
# findfile — pick files in TUI, open in $EDITOR
ff() {
  local out
  out=$(findfile "$@")
  [ -z "$out" ] && return 1
  # Open each picked path. Handles path:line format automatically.
  while IFS= read -r line; do
    ${EDITOR:-vim} "$line"
  done <<< "$out"
}

# ffe — pick and edit (shorthand)
alias ffe=ff

# ffg — grep for pattern, then edit selection
ffg() {
  local out
  out=$(findfile --mode content "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    ${EDITOR:-vim} "$line"
  done <<< "$out"
}
```

## Fish

Add to `~/.config/fish/config.fish`:

```fish
function ff
    set out (findfile $argv)
    test -z "$out"; and return 1
    for line in (string split \n "$out")
        test -n "$line"; and $EDITOR "$line"
    end
end

function ffg
    set out (findfile --mode content $argv)
    test -z "$out"; and return 1
    for line in (string split \n "$out")
        test -n "$line"; and $EDITOR "$line"
    end
end
```

## Multi-select

Inside the TUI, press **Space** to mark a row. Press **Enter** to print all
marked paths (one per line). If nothing is marked, **Enter** prints the single
selected result.

```bash
# Open three files at once in separate buffers
ff --format path
# → /home/you/src/a.ts
# → /home/you/src/b.ts
# → /home/you/src/c.ts
```

## Fzf-style preview command

Replace the built-in preview pane with any shell command:

```bash
ff --preview-cmd 'bat --color=always {} -r :{line}'
```

Tokens:
- `{}` — absolute path of the selected result
- `{line}` — match line number (empty string in files/dirs mode)

Other examples:

```bash
# Head of file with line numbers
ff --preview-cmd 'head -n 50 {} | nl -v 1'

# Show git diff for the file
ff --preview-cmd 'git diff --color=always {}'

# JSON pretty-print
ff --preview-cmd 'cat {} | jq .'
```

## Pipe workflows

`findfile` auto-detects when stdout is not a TTY and switches to plain-line
output. This means piping "just works":

```bash
# Pipe to head
findfile app | head -5

# Use with xargs
findfile --format null . | xargs -0 wc -l

# Search only files changed in git
git diff --name-only | findfile --paths-from - --mode content TODO

# Search with stdin query
echo "schema migration" | findfile --mode content
```

## Editor-specific tips

### Neovim / Vim

The `--format line` output (`path:line:col`) opens files at the right location:

```bash
# In your shell wrapper
ffg() {
  local out
  out=$(findfile --mode content --format line "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    # vim understands path:line:col out of the box
    ${EDITOR:-nvim} "$line"
  done <<< "$out"
}
```

### VS Code

```bash
ffcode() {
  local out
  out=$(findfile --format path "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    code -g "$line"
  done <<< "$out"
}
```

### Emacs

```bash
ffemacs() {
  local out
  out=$(findfile --format path "$@")
  [ -z "$out" ] && return 1
  while IFS= read -r line; do
    emacsclient -n +"$line"
  done <<< "$out"
}
```
