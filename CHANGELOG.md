# Changelog

## [0.2.0] - 2026-11-09

### Added
- Add an OpenCode 2.2.6+ TUI plugin with AI-generated editable commit messages, separate commit and push confirmations, and staged-index safeguards.
- Add a single-panel OpenCode topic selector with checkboxes, file status and line totals, keyboard navigation, and expandable file lists.
- Add a global OpenCode installation path and document review-race and wrong-repository limits.
- Add executable Git-core tests for rename staging, concurrent unrelated staging, review changes, and a staged-index guard.

### Changed
- Use OpenTUI's Solid JSX runtime for the custom selector and keep selector keystrokes from reaching the composer underneath.
- Commit selected paths with `git commit --only`, verify staged names with `--no-renames`, and stop when review changes or concurrent staged paths are detected.
- Document OpenCode installation and review safeguards.

## [0.1.9] - 2026-10-27

### Changed
- Support Pi and OMP APIs for model completion and progress indicators.
## [0.1.8] - 2026-11-24

### Changed
- Allow split commits to proceed without blocking on Git whitespace-check findings.

## [0.1.7] - 2026-10-13

### Added
- Show each topic's changed files and their Git status in the split-commit selector.
- Show per-topic file counts and added/deleted line totals, with binary-file counts when applicable.
- Add a bordered selector panel and a `v` shortcut to expand or collapse long file lists.
- Keep lists of up to four files expanded by default; summarize longer lists until expanded.

### Changed
- Update the README with the new selector layout and keyboard shortcut.
