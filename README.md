# pi-commit-split

Interactive topic-based commit workflow for [Pi](https://github.com/badlogic/pi-mono).

The extension groups Git changes, asks the active LLM for concise Conventional Commit messages, and lets you choose which groups to commit from a TUI.

## Features

- Adaptive topic grouping for any Git repository
- LLM-generated commit subject and short body
- Commit-message language follows recent commits and user context
- Conservative default selection: pre-existing and tooling changes start unchecked
- Explicit file staging; never uses `git add .`
- Separate commit or commit-and-push actions
- Refuses to start when the Git index already contains staged changes
- Conventional Commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, and `ci`

## Commands

```text
/commit-split   Select topics and create separate commits
/commit-push    Select topics, commit, and push
```

Shortcuts:

```text
Ctrl+Shift+C   Select topics and commit
Ctrl+Shift+P   Select topics, commit, and push
```

Inside the TUI:

```text
Space          Toggle the current topic
A              Select all topics
N              Select no topics
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
pi install git:github.com/ismailokta/pi-commit-split@v0.1.0
```

Try locally without installing:

```bash
pi -e ./extensions/commit-workflow.ts
```

The extension uses the active Pi model to generate commit messages. Review every selected topic and message before committing or pushing.
