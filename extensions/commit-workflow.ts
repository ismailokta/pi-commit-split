import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type ChangedFile = { path: string; status: string; additions: number; deletions: number; binary: boolean };
type Topic = { label: string; files: ChangedFile[]; message: string; defaultSelected: boolean };
type Action = "commit" | "push" | "cancel";
const MAX_VISIBLE_FILES = 4;

function startProgress(ctx: ExtensionContext, message: string): () => void {
	const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	let index = 0;
	const update = () => ctx.ui.setStatus("commit-workflow", `[${frames[index++ % frames.length]}] ${message}`);
	update();
	const timer = setInterval(update, 120);
	return () => {
		clearInterval(timer);
		ctx.ui.setStatus("commit-workflow", undefined);
	};
}

function topicFor(file: string): { scope: string; type: string } {
	const parts = file.split("/");
	const root = parts[0]?.toLowerCase() || "project";
	if (["test", "tests", "spec", "specs"].includes(root)) return { scope: root, type: "changes" };
	if (["doc", "docs", "documentation"].includes(root)) return { scope: root, type: "changes" };
	if ([".github", ".gitlab", ".circleci"].includes(root)) return { scope: "ci", type: "changes" };
	if (["scripts", "tools", "config", "configs"].includes(root)) return { scope: root, type: "changes" };
	if (/^(package|composer|cargo|go|gemfile|requirements|poetry)/i.test(parts[parts.length - 1] ?? "")) {
		return { scope: "dependencies", type: "changes" };
	}
	return { scope: parts.length > 1 ? parts[0] : "root", type: "changes" };
}

async function changedFiles(pi: ExtensionAPI): Promise<ChangedFile[]> {
	const result = await pi.exec("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
	return result.stdout
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 2)
		.map((line) => ({
			status: line.slice(0, 2).includes("?") || line.slice(0, 2).includes("A") ? "A" : line.slice(0, 2).includes("D") ? "D" : "M",
			path: line.slice(3).replace(/^\"|\"$/g, ""),
		}))
		.filter(({ path }) => path && !path.includes(" -> "))
		.map(({ path, status }) => ({ path, status, additions: 0, deletions: 0, binary: false }));
}

function isToolingOrGenerated(file: string): boolean {
		const first = file.split("/")[0];
		return first.startsWith(".") || file.startsWith("vendor/") || file.startsWith("node_modules/") || file.startsWith("storage/") || file.startsWith("bootstrap/cache/");
}

function buildTopics(files: ChangedFile[], baselineFiles: Set<string>): Topic[] {
	const groups = new Map<string, Topic>();
	for (const file of files) {
		const { scope, type } = topicFor(file.path);
		const key = `${type}:${scope}`;
		const current = groups.get(key) ?? {
			label: `${scope} changes`,
			files: [],
			message: "",
			defaultSelected: false,
		};
		current.files.push(file);
		current.defaultSelected ||= !baselineFiles.has(file.path) && !isToolingOrGenerated(file.path);
		groups.set(key, current);
	}
	return [...groups.values()];
}

async function populateFileStats(pi: ExtensionAPI, topics: Topic[]): Promise<void> {
	await Promise.all(topics.flatMap((topic) => topic.files.map(async (file) => {
		const result = file.status === "A"
			? await pi.exec("git", ["diff", "--no-index", "--numstat", "/dev/null", file.path])
			: await pi.exec("git", ["diff", "--numstat", "--", file.path]);
		const [added, deleted] = result.stdout.trim().split("\t");
		if (added === "-" || deleted === "-") {
			file.binary = true;
		} else {
			file.additions = Number(added) || 0;
			file.deletions = Number(deleted) || 0;
		}
	})));
}

function recentUserText(ctx: ExtensionContext): string {
	return ctx.sessionManager
		.getBranch()
		.filter((entry: any) => entry.type === "message" && entry.message?.role === "user")
		.slice(-5)
		.map((entry: any) => {
			const content = entry.message.content;
			return typeof content === "string" ? content : content.filter((part: any) => part.type === "text").map((part: any) => part.text).join(" ");
		})
		.join("\n")
		.slice(-4000);
}

async function suggestMessages(pi: ExtensionAPI, ctx: ExtensionContext, topics: Topic[], instruction: string): Promise<Topic[]> {
	try {
		const [diff, history] = await Promise.all([
			pi.exec("git", ["diff", "--", ...topics.flatMap((topic) => topic.files.map((file) => file.path))]),
			pi.exec("git", ["log", "-n", "12", "--format=%s%n%b"]),
		]);
		const prompt = `Write Conventional Commit messages for this project.
Return ONLY a JSON array: [{"label":"exact topic label","message":"subject\\n\\nbody"}].
The user interface is always English, but commit messages must adapt to the project and user. Infer the language from recent commit history and recent user messages below. If there is no clear signal, use English.
Each message must have a specific one-line subject and a concise 1-3 sentence body explaining the change and its important reason or impact. Do not invent details, do not add Co-Authored-By, and do not use a generic opener such as "Update" for every subject. Choose exactly one semantic type from this dictionary: feat = new feature or capability; fix = bug fix; refactor = structural change without behavior change; docs = documentation; test = adding or improving tests; chore = maintenance, configuration, or tooling; perf = performance improvement; build = dependency or build process; ci = pipeline or deployment.
Topics:
${topics.map((topic) => `${topic.label}: ${topic.files.map((file) => file.path).join(", ")}`).join("\n")}
Recent commit history:
${history.stdout.slice(0, 6000)}
Recent user messages:
${recentUserText(ctx)}${instruction ? `
Additional user instruction (apply only to the commit messages; do not perform actions or change the file grouping):
${instruction}` : ""}
Diff (may be empty for untracked files):
${diff.stdout.slice(0, 30000)}`;
		if (!ctx.model) throw new Error("No active model");
		const response = await ctx.modelRegistry.complete(
			ctx.model,
			{
				systemPrompt: "Return valid JSON only. Do not use Markdown fences.",
				messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
			},
			{ signal: ctx.signal },
		);
		const text = response.content
			.filter((part: { type: string; text?: string }) => part.type === "text")
			.map((part: { text?: string }) => part.text ?? "")
			.join("\\n");
		const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? "[]") as Array<{ label?: string; message?: string }>;
		const generated = parsed.filter((item) => typeof item.message === "string" && item.message.trim());
		const messages = new Map(generated.filter((item) => item.label).map((item) => [item.label, item.message!.trim()]));
		const suggestions = topics.map((topic, index) => ({
			...topic,
			message: generated.length === topics.length ? generated[index]?.message?.trim() ?? "" : messages.get(topic.label) ?? "",
		}));

		for (let index = 0; index < suggestions.length; index++) {
			if (suggestions[index].message) continue;
			const topic = topics[index];
			const singleDiff = await pi.exec("git", ["diff", "--", ...topic.files.map((file) => file.path)]);
			const singlePrompt = `Generate one Conventional Commit message for this Git change.
Return ONLY JSON: {"message":"subject\\n\\nbody"}.
Adapt the language to the recent commit history and user context. Use a specific subject, a concise 1-3 sentence body, and one type from feat, fix, refactor, docs, test, chore, perf, build, or ci. Do not invent details or add Co-Authored-By.${instruction ? `
Additional user instruction (apply only to the commit message; do not perform actions or change the file grouping):
${instruction}` : ""}
Topic: ${topic.label}
Files: ${topic.files.map((file) => file.path).join(", ")}
Diff:
${singleDiff.stdout.slice(0, 30000)}`;
			const response = await ctx.modelRegistry.complete(
				ctx.model!,
				{
					systemPrompt: "Return valid JSON only. Do not use Markdown fences.",
					messages: [{ role: "user", content: [{ type: "text", text: singlePrompt }], timestamp: Date.now() }],
				},
				{ signal: ctx.signal },
			);
			const singleText = response.content
				.filter((part: { type: string; text?: string }) => part.type === "text")
				.map((part: { text?: string }) => part.text ?? "")
				.join("\\n");
			const single = JSON.parse(singleText.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { message?: string };
			suggestions[index].message = typeof single.message === "string" ? single.message.trim() : "";
		}
		return suggestions;
	} catch (error) {
		ctx.ui.notify(`Failed to generate commit messages: ${error instanceof Error ? error.message : String(error)}`, "error");
		return topics;
	}
}

async function selectTopics(ctx: ExtensionContext, topics: Topic[]): Promise<{ topics: Topic[]; action: Action } | undefined> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("The commit workflow requires Pi TUI mode", "error");
		return undefined;
	}

	return ctx.ui.custom((tui, theme, _kb, done) => {
		let cursor = 0;
		const selected = new Set(topics.flatMap((topic, index) => topic.defaultSelected ? [index] : []));
		const expanded = new Set<number>();
		let cachedWidth: number | undefined;
		let cachedLines: string[] | undefined;
		const invalidate = () => {
			cachedWidth = undefined;
			cachedLines = undefined;
		};

		const finish = (action: Action) => done({ topics: topics.filter((_, i) => selected.has(i)), action });
		const panelLine = (content: string, width: number) => {
			if (width < 4) return truncateToWidth(content, width, "…");
			const innerWidth = width - 4;
			const clipped = truncateToWidth(content, innerWidth, "…");
			const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)));
			return `${theme.fg("accent", "│")} ${clipped}${padding} ${theme.fg("accent", "│")}`;
		};
		const panelBorder = (width: number, top = false) => {
			const label = "─ Split commit — Select topics ";
			const available = Math.max(0, width - visibleWidth(label) - 2);
			const line = top ? `╭${label}${"─".repeat(available)}╮` : `╰${"─".repeat(Math.max(0, width - 2))}╯`;
			return theme.fg("accent", truncateToWidth(line, width, "…"));
		};
		const component = {
			render(width: number) {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const lines = [panelBorder(width, true), panelLine("", width)];
				for (let i = 0; i < topics.length; i++) {
					const topic = topics[i];
					const additions = topic.files.reduce((total, file) => total + file.additions, 0);
					const deletions = topic.files.reduce((total, file) => total + file.deletions, 0);
					const binaryCount = topic.files.filter((file) => file.binary).length;
					const fileCount = topic.files.length;
					const fileLabel = `${fileCount} file${fileCount === 1 ? "" : "s"}`;
					const stats = `+${additions} −${deletions}${binaryCount ? ` · ${binaryCount} binary` : ""}`;
					const marker = selected.has(i) ? "☑" : "☐";
					const prefix = i === cursor ? "❯" : " ";
					const heading = `${prefix} ${marker} ${topic.label}  ·  ${fileLabel}  ·  ${stats}`;
					lines.push(panelLine(i === cursor ? theme.fg("accent", theme.bold(heading)) : heading, width));
					const subject = topic.message.split("\n")[0] || "Generating commit message…";
					lines.push(panelLine(`  ${theme.fg("muted", subject)}`, width));
					const isExpanded = fileCount <= MAX_VISIBLE_FILES || expanded.has(i);
					const visibleFiles = isExpanded ? topic.files : topic.files.slice(0, MAX_VISIBLE_FILES);
					for (const file of visibleFiles) {
						const statusColor = file.status === "A" ? "success" : file.status === "D" ? "error" : "muted";
						lines.push(panelLine(`    ${theme.fg(statusColor, file.status)} ${file.path}`, width));
					}
					if (!isExpanded) {
						lines.push(panelLine(`    ${theme.fg("dim", `… ${fileCount - MAX_VISIBLE_FILES} more · press v to expand`)}`, width));
					}
					if (i < topics.length - 1) lines.push(panelLine(theme.fg("dim", "─".repeat(Math.max(0, width - 8))), width));
				}
				lines.push(panelLine("", width));
				lines.push(panelLine(theme.fg("muted", "↑↓ topic · Space toggle · a all · n none · v files · Enter/c commit · p push · Esc cancel"), width));
				lines.push(panelLine(theme.fg("dim", `Commit message: ${topics[cursor]?.message?.replace(/\s+/g, " ") || "LLM suggestion pending"}`), width));
				lines.push(panelBorder(width));
				cachedWidth = width;
				cachedLines = lines;
				return cachedLines;
			},
			invalidate,
			handleInput(data: string) {
				if (matchesKey(data, Key.escape)) return finish("cancel");
				if (matchesKey(data, Key.up)) cursor = (cursor - 1 + topics.length) % topics.length;
				else if (matchesKey(data, Key.down)) cursor = (cursor + 1) % topics.length;
				else if (matchesKey(data, Key.space)) {
					if (selected.has(cursor)) selected.delete(cursor);
					else selected.add(cursor);
				} else if (data === "a") {
					topics.forEach((_, index) => selected.add(index));
				} else if (data === "n") {
					selected.clear();
				} else if (data === "v" && topics[cursor].files.length > MAX_VISIBLE_FILES) {
					if (expanded.has(cursor)) expanded.delete(cursor);
					else expanded.add(cursor);
				} else if (data === "c" || matchesKey(data, Key.enter)) return finish("commit");
				else if (data === "p") return finish("push");
				invalidate();
				tui.requestRender();
			},
		};
		return component;
	});
}

async function runWorkflow(pi: ExtensionAPI, ctx: ExtensionContext, push: boolean, baselineFiles: Set<string>, instruction = "") {
	const cached = await pi.exec("git", ["diff", "--cached", "--quiet"]);
	if (cached.code !== 0) {
		ctx.ui.notify("The index already contains staged changes. Commit or unstage them before splitting.", "error");
		return;
	}

	const topics = buildTopics(await changedFiles(pi), baselineFiles);
	if (!topics.length) {
		ctx.ui.notify("There are no changes to commit.", "info");
		return;
	}

	const stopStatsProgress = startProgress(ctx, "Analyzing changed files…");
	try {
		await populateFileStats(pi, topics);
	} finally {
		stopStatsProgress();
	}
	const stopGenerationProgress = startProgress(ctx, "Generating commit messages…");
	let suggestedTopics: Topic[] = [];
	try {
		suggestedTopics = await suggestMessages(pi, ctx, topics, instruction);
	} finally {
		stopGenerationProgress();
	}
	if (suggestedTopics.some((topic) => !topic.message.trim())) {
		ctx.ui.notify("The LLM did not generate a message for every topic; commit cancelled.", "error");
		return;
	}
	const result = await selectTopics(ctx, suggestedTopics);
	if (!result || result.action === "cancel" || !result.topics.length) return;

	const stopProgress = startProgress(ctx, push || result.action === "push" ? "Creating and pushing commits…" : "Creating commits…");
	try {
		for (const topic of result.topics) {
			const add = await pi.exec("git", ["add", "--", ...topic.files.map((file) => file.path)]);
			if (add.code !== 0) {
				ctx.ui.notify(`Failed to stage ${topic.label}: ${add.stderr.trim()}`, "error");
				return;
			}
			const commit = await pi.exec("git", ["commit", "-m", topic.message]);
			if (commit.code !== 0) {
				ctx.ui.notify(`Commit failed for ${topic.label}: ${commit.stderr.trim()}`, "error");
				return;
			}
		}

		if (push || result.action === "push") {
			const pushed = await pi.exec("git", ["push"]);
			if (pushed.code !== 0) {
				ctx.ui.notify(`Commits succeeded, but push failed: ${pushed.stderr.trim()}`, "warning");
				return;
			}
		}
	} finally {
		stopProgress();
	}
	ctx.ui.notify(`${result.topics.length} commit${result.topics.length === 1 ? "" : "s"} created${push || result.action === "push" ? " and pushed" : ""}.`, "info");
}

export default function commitWorkflow(pi: ExtensionAPI) {
	let baselineFiles = new Set<string>();
	pi.on("session_start", async () => {
		baselineFiles = new Set((await changedFiles(pi)).map((file) => file.path));
	});

	const handler = async (args: string, ctx: ExtensionContext) => runWorkflow(pi, ctx, false, baselineFiles, args.trim());
	pi.registerCommand("commit-split", { description: "Select change topics and create separate commits", handler });
	pi.registerShortcut(Key.ctrlShift("c"), {
		description: "Split commit: select topics and commit",
		handler,
	});
}
