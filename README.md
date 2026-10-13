# pi-commit-split

Interactive topic-based commit workflow for [Pi](https://github.com/badlogic/pi-mono).

The extension groups Git changes, asks the active LLM for concise Conventional Commit messages, and lets you choose which groups to commit from a TUI.

## Features

- Adaptive topic grouping for any Git repository
- LLM-generated commit subject and short body
- Commit-message language follows recent commits and user context
- Conservative default selection: pre-existing and tooling changes start unchecked
- Shows each topic's changed files, file status, and added/deleted line counts
- Automatically condenses long file lists; press `v` to expand or collapse the current topic
- Explicit file staging; never uses `git add .`
- Separate commit or commit-and-push actions
- Refuses to start when the Git index already contains staged changes
- Optional natural-language instructions for commit message language and style
- Conventional Commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, and `ci`

## TUI preview

The workflow opens a bordered terminal selector. Topics that look unrelated or pre-existing start unchecked, while current task changes are selected conservatively. File lists are expanded by default; lists longer than four files are condensed until expanded with `v`:

```text
╭─ Split commit — Select topics ───────────────────────────────────────────────╮
│                                                                              │
│ ❯ ☑ src changes · 3 files · +42 −8                                          │
│    feat(editor): add markdown preview                                       │
│    M src/editor.ts                                                          │
│    A src/preview.ts                                                         │
│    M tests/editor.test.ts                                                   │
│ ──────────────────────────────────────────────────────────────────────────  │
│   ☐ docs changes · 6 files · +18 −2                                         │
│    docs(readme): explain the preview workflow                               │
│    M docs/setup.md                                                          │
│    M README.md                                                              │
│    M docs/commands.md                                                       │
│    M docs/examples.md                                                       │
│    … 2 more · press v to expand                                             │
│                                                                              │
│ ↑↓ topic · Space toggle · a all · n none · v files · Enter/c commit · p push│
│ Esc cancel                                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
```

Commit messages are generated from the diff and adapt to the repository's existing language and the user's context. The interface remains in English.

## Commands

```text
/commit-split [optional natural-language instruction]   Select topics and create separate commits

Examples:
/commit-split
/commit-split dalam bahasa Indonesia
/commit-split gunakan subject maksimal 60 karakter
```

Shortcuts:

```text
Ctrl+Shift+C   Select topics and commit
```

Inside the TUI:

```text
Space          Toggle the current topic
A              Select all topics
N              Select no topics
v              Expand/collapse the current topic's file list
Enter / C      Commit selected topics
P              Commit selected topics and push
Esc            Cancel
```

## Install

From npm:

```bash
pi install npm:pi-commit-split
```

From GitHub:

```bash
pi install git:github.com/ismailokta/pi-commit-split@v0.1.7
```

Try locally without installing:

```bash
pi -e ./extensions/commit-workflow.ts
```

The extension uses the active Pi model to generate commit messages. An optional instruction affects commit-message language and style only; it cannot run Git commands, change files, bypass validation, or trigger a push. Topic grouping remains based on the repository's file structure. Review every selected topic and message before committing or pushing.
