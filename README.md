# pi-commit-split

Interactive topic-based commit workflow for [Pi](https://github.com/badlogic/pi-mono) and OpenCode.

Pi and OpenCode adapters group Git changes and let you review separate commits in the terminal. Pi and OpenCode use the selected model to suggest editable commit messages.

## Features

- Adaptive topic grouping for any Git repository
- Pi uses its active model for commit-message suggestions, adapting to recent commits and user context
- OpenCode uses its selected model to generate editable commit subjects from the changes
- Compatible with Pi and OMP extension APIs, with a separate OpenCode TUI adapter
- Pi's selector shows each topic's changed files, status, and added/deleted line counts
- Automatically condenses long file lists; press `v` to expand or collapse the current topic
- Explicit file staging; never uses `git add .`
- Separate commit or commit-and-push actions
- Refuses to start when the Git index already contains staged changes
- Optional natural-language instructions for commit message language and style
- Conventional Commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `build`, and `ci`

## TUI preview

In Pi, the workflow opens a bordered terminal selector. OpenCode now uses one selector panel for all groups, with checkboxes, per-group file lists, status, and line totals. Topics that look unrelated or pre-existing start unchecked in Pi. OpenCode starts with no groups selected because it cannot infer which changes belong to the current task:

```text
╭─ Split commit — Select topics ───────────────────────────────────────────────╮
│                                                                              │
│ ❯ ☐ src changes · 3 files · +42 −8                                          │
│    feat(src): update related files · AI suggestion               │
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
│ ↑↓ topic · Space toggle · a all · n none · v files · Enter commit · p push │
│ Esc cancel                                                                   │
╰──────────────────────────────────────────────────────────────────────────────╯
```

In Pi, commit messages are suggested from the diff and adapt to recent commits and user context. OpenCode generates editable subjects using its selected model. The interface remains in English.

## Commands

```text
/commit-split [optional natural-language instruction]   Select topics and create separate commits

Examples:
/commit-split
/commit-split dalam bahasa Indonesia
/commit-split gunakan subject maksimal 60 karakter
```

In OpenCode, the optional text is included as an instruction for generating commit messages.

OpenCode usage: `/commit-split` opens one scrollable selector containing every group. It shows as many groups as fit the current terminal height; ↑/↓ moves through the complete list and keeps the current group in view. Space toggles the current group, `a` selects all, `n` selects none, `v` expands/collapses the current file list, and PageUp/PageDown scrolls through expanded content. Enter commits, `p` chooses commit-and-push, and Esc cancels. Each group shows its files, status, line totals, and an editable AI-generated commit subject. Review the repository path and commit summary before confirming. Choosing `p` shows a commit confirmation first and a separate push confirmation after the local commits succeed. Enter commits locally without asking to push. If a later group fails, the plugin reports how many commits succeeded and does not reset the index. Any staged files from a failed operation are left in place for review. The selected model receives bounded diffs and untracked text content; review sensitive content before running the command. If generation fails, no commit is made. The workflow checks for worktree changes during review, verifies staged paths with rename detection disabled, and uses `git commit --only` so unrelated staged paths added concurrently are not included. Git cannot lock a user's worktree and index across review, staging, and commit: a simultaneous edit or stage to a selected path after the final verification can still race. The final dialog shows the repository path to help avoid acting in the wrong project, but cannot infer which repository you intended.

Shortcuts:

```text
Ctrl+Shift+C   Select topics and commit
```

Inside the Pi selector:

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

### OpenCode (project-local)

OpenCode 2.2.6 or newer discovers this adapter from the project directory. Keep this repository in your project and add the following shim (already included when using this repository directly):

```text
.opencode/plugins/commit-split/tui.ts
```

Its contents are:

```ts
export { default } from "../../../extensions/opencode-plugin";
```

Restart OpenCode or reload plugins, then run `/commit-split`. The command is also available from the command palette. This project-local setup does not change global OpenCode configuration. If installing the npm package instead, expose its `./tui` entrypoint in the OpenCode plugin configuration used by your setup.

### OpenCode (global, all repositories)

OpenCode 2.2.6 discovers TUI plugins under the global config directory. This setup links the adapter and its shared Git workflow module from this checkout, so the command is available in every repository without adding files to those repositories. Run from the `pi-commit-split` checkout:

```bash
plugin_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/pi-commit-split"
mkdir -p "$plugin_dir"
ln -sfn "$PWD/extensions/opencode-plugin.tsx" "$plugin_dir/opencode-plugin.tsx"
ln -sfn "$PWD/extensions/commit-core.ts" "$plugin_dir/commit-core.ts"
printf 'export { default } from "./opencode-plugin";\n' > "$plugin_dir/tui.ts"
```

Restart OpenCode or reload plugins and run `/commit-split`. The global directory follows `XDG_CONFIG_HOME` when set, otherwise `~/.config/opencode/plugins/`. This does not require a project `cli.json`; the TUI discovers global plugins locally, including when connected to a remote server. The symlinks point to this checkout, so keep it in place.

### Pi

From npm:

```bash
pi install npm:pi-commit-split
```

From GitHub:

```bash
pi install git:github.com/ismailokta/pi-commit-split@v0.1.9
```

Try locally without installing:

```bash
pi -e ./extensions/commit-workflow.ts
```

The extension uses the active Pi/OMP model to generate commit messages. An optional instruction affects commit-message language and style only; it cannot run Git commands, change files, bypass validation, or trigger a push. Topic grouping remains based on the repository's file structure. Review every selected topic and message before committing or pushing.
