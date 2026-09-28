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

## TUI preview

The workflow opens a focused terminal selector. Topics that look unrelated or pre-existing start unchecked, while current task changes are selected conservatively:

```text
┌─ Split commit — Select topics ───────────────────────────────────────────────┐
│                                                                              │
│ ❯ ☑ src changes — feat(editor): Add markdown preview support                 │
│   ☑ docs changes — docs(readme): Explain the preview workflow                │
│   ☐ .pi changes — chore(.pi): Refresh local Pi configuration                 │
│   ☐ assets changes — chore(assets): Add updated interface screenshots        │
│                                                                              │
│ ↑↓ move · Space toggle · a select all · n select none                        │
│ Enter/c commit · p commit & push · Esc cancel                                │
│                                                                              │
│ Commit message:                                                              │
│ feat(editor): Add markdown preview support                                   │
│                                                                              │
│ Adds a preview step for rendered Markdown while keeping the source editor    │
│ unchanged. This makes it easier to review formatting before committing.      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Commit messages are generated from the diff and adapt to the repository's existing language and the user's context. The interface remains in English.

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

## Panduan publishing

Panduan lengkap GitHub, npm, Pi Package, Trusted Publishing, dan GitHub Actions tersedia di [`docs/publishing-pi-package.md`](docs/publishing-pi-package.md).

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

## Release

Publishing is handled by GitHub Actions when a version tag is pushed. The tag must match `package.json` exactly:

```bash
npm version patch
# or: npm version minor / npm version major
git push origin main --follow-tags
```

The workflow validates the tag, then publishes to npm with provenance. Configure npm Trusted Publishing for this repository before the first automated release:

- Package: `pi-commit-split`
- Provider: GitHub Actions
- Repository: `ismailokta/pi-commit-split`
- Workflow: `.github/workflows/publish.yml`

The extension uses the active Pi model to generate commit messages. Review every selected topic and message before committing or pushing.
