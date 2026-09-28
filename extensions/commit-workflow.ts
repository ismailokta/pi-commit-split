import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";

type Topic = { label: string; files: string[]; message: string; defaultSelected: boolean };
type Action = "commit" | "push" | "cancel";

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

async function changedFiles(pi: ExtensionAPI): Promise<string[]> {
	const result = await pi.exec("git", ["status", "--porcelain=v1"]);
	return result.stdout
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 2)
		.map((line) => line.slice(3).replace(/^\"|\"$/g, ""))
		.filter((file) => file && !file.includes(" -> "));
}

function isToolingOrGenerated(file: string): boolean {
		const first = file.split("/")[0];
		return first.startsWith(".") || file.startsWith("vendor/") || file.startsWith("node_modules/") || file.startsWith("storage/") || file.startsWith("bootstrap/cache/");
}

function buildTopics(files: string[], baselineFiles: Set<string>): Topic[] {
	const groups = new Map<string, Topic>();
	for (const file of files) {
		const { scope, type } = topicFor(file);
		const key = `${type}:${scope}`;
		const current = groups.get(key) ?? {
			label: `${scope} changes`,
			files: [],
			message: "",
			defaultSelected: false,
		};
		current.files.push(file);
		current.defaultSelected ||= !baselineFiles.has(file) && !isToolingOrGenerated(file);
		groups.set(key, current);
	}
	return [...groups.values()];
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

async function suggestMessages(pi: ExtensionAPI, ctx: ExtensionContext, topics: Topic[]): Promise<Topic[]> {
	try {
		const [diff, history] = await Promise.all([
			pi.exec("git", ["diff", "--", ...topics.flatMap((topic) => topic.files)]),
			pi.exec("git", ["log", "-n", "12", "--format=%s%n%b"]),
		]);
		const prompt = `Write Conventional Commit messages for this project.
Return ONLY a JSON array: [{"label":"exact topic label","message":"subject\\n\\nbody"}].
The user interface is always English, but commit messages must adapt to the project and user. Infer the language from recent commit history and recent user messages below. If there is no clear signal, use English.
Each message must have a specific one-line subject and a concise 1-3 sentence body explaining the change and its important reason or impact. Do not invent details, do not add Co-Authored-By, and do not use a generic opener such as "Update" for every subject. Choose exactly one semantic type from this dictionary: feat = new feature or capability; fix = bug fix; refactor = structural change without behavior change; docs = documentation; test = adding or improving tests; chore = maintenance, configuration, or tooling; perf = performance improvement; build = dependency or build process; ci = pipeline or deployment.
Topics:
${topics.map((topic) => `${topic.label}: ${topic.files.join(", ")}`).join("\n")}
Recent commit history:
${history.stdout.slice(0, 6000)}
Recent user messages:
${recentUserText(ctx)}
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
			const singleDiff = await pi.exec("git", ["diff", "--", ...topic.files]);
			const singlePrompt = `Generate one Conventional Commit message for this Git change.
Return ONLY JSON: {"message":"subject\\n\\nbody"}.
Adapt the language to the recent commit history and user context. Use a specific subject, a concise 1-3 sentence body, and one type from feat, fix, refactor, docs, test, chore, perf, build, or ci. Do not invent details or add Co-Authored-By.
Topic: ${topic.label}
Files: ${topic.files.join(", ")}
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
		let cachedWidth: number | undefined;
		let cachedLines: string[] | undefined;
		const invalidate = () => {
			cachedWidth = undefined;
			cachedLines = undefined;
		};

		const finish = (action: Action) => done({ topics: topics.filter((_, i) => selected.has(i)), action });
		const component = {
			render(width: number) {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const lines = [
					theme.fg("accent", theme.bold("Split commit — Select topics")),
					"",
				];
				for (let i = 0; i < topics.length; i++) {
					const topic = topics[i];
					const marker = selected.has(i) ? "☑" : "☐";
					const prefix = i === cursor ? theme.fg("accent", "❯ ") : "  ";
					lines.push(`${prefix}${marker} ${topic.label} — ${topic.message.replace(/\s+/g, " ") || "Generating commit messages…"}`);
				}
				lines.push("", theme.fg("muted", "↑↓ move · Space toggle · a select all · n select none · Enter/c commit · p commit & push · Esc cancel"));
				lines.push(theme.fg("dim", `Commit message: ${topics[cursor]?.message?.replace(/\s+/g, " ") || "LLM suggestion pending"}`));
				cachedWidth = width;
				cachedLines = lines.map((line) => truncateToWidth(line, width, "…"));
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
				} else if (data === "c" || matchesKey(data, Key.enter)) return finish("commit");
				else if (data === "p") return finish("push");
				invalidate();
				tui.requestRender();
			},
		};
		return component;
	});
}

async function runWorkflow(pi: ExtensionAPI, ctx: ExtensionContext, push: boolean, baselineFiles: Set<string>) {
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

	ctx.ui.setStatus("commit-workflow", "Generating commit messages…");
	const suggestedTopics = await suggestMessages(pi, ctx, topics);
	ctx.ui.setStatus("commit-workflow", undefined);
	if (suggestedTopics.some((topic) => !topic.message.trim())) {
		ctx.ui.notify("The LLM did not generate a message for every topic; commit cancelled.", "error");
		return;
	}
	const result = await selectTopics(ctx, suggestedTopics);
	if (!result || result.action === "cancel" || !result.topics.length) return;

	for (const topic of result.topics) {
		const add = await pi.exec("git", ["add", "--", ...topic.files]);
		if (add.code !== 0) {
			ctx.ui.notify(`Failed to stage ${topic.label}: ${add.stderr.trim()}`, "error");
			return;
		}
		const check = await pi.exec("git", ["diff", "--cached", "--check"]);
		if (check.code !== 0) {
			ctx.ui.notify(`Whitespace error in ${topic.label}; the index was left staged for correction.`, "error");
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
	ctx.ui.notify(`${result.topics.length} commit${result.topics.length === 1 ? "" : "s"} created${push || result.action === "push" ? " and pushed" : ""}.`, "info");
}

export default function commitWorkflow(pi: ExtensionAPI) {
	let baselineFiles = new Set<string>();
	pi.on("session_start", async () => {
		baselineFiles = new Set(await changedFiles(pi));
	});

	const handler = async (_args: string, ctx: ExtensionContext) => runWorkflow(pi, ctx, false, baselineFiles);
	pi.registerCommand("commit-split", { description: "Select change topics and create separate commits", handler });
	pi.registerCommand("commit-push", {
		description: "Select change topics, commit, and push",
		handler: async (_args, ctx) => runWorkflow(pi, ctx, true, baselineFiles),
	});
	pi.registerShortcut(Key.ctrlShift("c"), {
		description: "Split commit: select topics and commit",
		handler,
	});
	pi.registerShortcut(Key.ctrlShift("p"), {
		description: "Split commit and push",
		handler: async (ctx) => runWorkflow(pi, ctx, true, baselineFiles),
	});
}
