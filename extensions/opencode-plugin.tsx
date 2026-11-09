/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { Context as PluginContext } from "@opencode/plugin/tui/context";
import type { ScrollBoxRenderable } from "@opentui/core";
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { useKeyboard } from "@opentui/solid";
import {
	assertReviewUnchanged,
	buildCommitPrompt,
	commitTopic,
	inspectRepository,
	parseCommitMessages,
	runGit,
	type Topic,
} from "./commit-core";

const MAX_VISIBLE_FILES = 4;
type SelectionAction = "commit" | "push";

function TopicSelector(props: {
	context: PluginContext;
	topics: Topic[];
	messages: string[];
	onFinish: (topics: Topic[], action: SelectionAction | "cancel") => void;
}) {
	const [cursor, setCursor] = createSignal(0);
	const [selected, setSelected] = createSignal(new Set<number>());
	const [expanded, setExpanded] = createSignal(new Set(topicsWithShortLists(props.topics)));
	const [terminalHeight, setTerminalHeight] = createSignal(props.context.renderer.height);
	let list!: ScrollBoxRenderable;
	const currentTopic = () => props.topics[cursor()];
	const panelHeight = () => Math.max(7, Math.min(terminalHeight() - 8, 36));
	const listHeight = () => Math.max(1, panelHeight() - 9);
	const updateHeight = () => setTerminalHeight(props.context.renderer.height);
	props.context.renderer.on("resize", updateHeight);
	onCleanup(() => props.context.renderer.off("resize", updateHeight));
	createEffect(() => {
		const active = cursor();
		list?.scrollChildIntoView(`commit-topic-${active}`);
	});
	const move = (direction: -1 | 1) => setCursor((cursor() + direction + props.topics.length) % props.topics.length);
	const toggle = () => {
		const next = new Set(selected());
		if (next.has(cursor())) next.delete(cursor());
		else next.add(cursor());
		setSelected(next);
	};
	const toggleFiles = () => {
		if ((currentTopic()?.files.length ?? 0) <= MAX_VISIBLE_FILES) return;
		const next = new Set(expanded());
		if (next.has(cursor())) next.delete(cursor());
		else next.add(cursor());
		setExpanded(next);
	};
	const finish = (action: SelectionAction | "cancel") => {
		props.onFinish(action === "cancel" ? [] : props.topics.filter((_, index) => selected().has(index)), action);
	};

	useKeyboard((key) => {
		// This selector owns input while open; keep shortcuts and ordinary letters out of the composer underneath.
		key.preventDefault();
		key.stopPropagation();
		switch (key.name.toLowerCase()) {
			case "up": move(-1); break;
			case "down": move(1); break;
			case "pageup": list?.scrollBy(-1, "viewport"); break;
			case "pagedown": list?.scrollBy(1, "viewport"); break;
			case "space": toggle(); break;
			case "a": setSelected(new Set(props.topics.map((_, index) => index))); break;
			case "n": setSelected(new Set()); break;
			case "v": toggleFiles(); break;
			case "return":
			case "enter": finish("commit"); break;
			case "p": finish("push"); break;
			case "escape": finish("cancel"); break;
		}
	});

	const theme = props.context.theme;
	return (
		<box
			border
			borderStyle="rounded"
			borderColor={theme.border.base}
			title="Split commit — Select topics"
			titleColor={theme.text.action.primary.base}
			height={panelHeight()}
			flexDirection="column"
			padding={1}
			gap={1}
			width="100%"
		>
			<box flexDirection="row" justifyContent="space-between">
				<text fg={theme.text.muted}>Group {cursor() + 1} of {props.topics.length}</text>
				<text fg={theme.text.action.primary.base}>{selected().size} selected</text>
			</box>
			<scrollbox
				ref={(node: ScrollBoxRenderable) => {
					list = node;
					node.verticalScrollBar.visible = true;
				}}
				id="commit-split-topic-list"
				height={listHeight()}
				width="100%"
				paddingRight={1}
				minHeight={0}
				flexGrow={1}
				flexShrink={1}
				scrollY
				viewportCulling
			>
			<For each={props.topics}>{(topic, index) => {
				const additions = topic.files.reduce((sum, file) => sum + file.additions, 0);
				const deletions = topic.files.reduce((sum, file) => sum + file.deletions, 0);
				const binary = topic.files.filter((file) => file.binary).length;
				const expandedFiles = () => topic.files.length <= MAX_VISIBLE_FILES || expanded().has(index());
				const listedFiles = () => expandedFiles() ? topic.files : topic.files.slice(0, MAX_VISIBLE_FILES);
				return (
					<box id={`commit-topic-${index()}`} flexDirection="column" gap={0} marginBottom={1}>
						<box flexDirection="row" justifyContent="space-between" gap={1}>
							<text fg={index() === cursor() || selected().has(index()) ? theme.text.action.primary.base : theme.text.base}>{index() === cursor() ? "❯" : " "} {selected().has(index()) ? "[✓]" : "[ ]"} {topic.label} · {topic.files.length} file{topic.files.length === 1 ? "" : "s"}</text>
							<box flexDirection="row" gap={1}>
								<text fg={theme.text.feedback.success.base}>+{additions}</text>
								<text fg={theme.text.feedback.error.base}>−{deletions}</text>
								<Show when={binary > 0}><text fg={theme.text.muted}>{binary} binary</text></Show>
							</box>
						</box>
						<box paddingLeft={2} flexDirection="column">
						<text fg={theme.text.feedback.success.base}>{props.messages[index()]}</text>
						<For each={listedFiles()}>{(file) => (
							<box flexDirection="row">
								<text fg={file.status === "A" ? theme.text.feedback.success.base : file.status === "D" ? theme.text.feedback.error.base : theme.text.feedback.warning.base}>{file.status} </text>
								<text fg={theme.text.base} flexShrink={1}>{file.path}</text>
							</box>
						)}</For>
						<Show when={!expandedFiles()}>
							<text fg={theme.text.muted}>  … {topic.files.length - MAX_VISIBLE_FILES} more · v expands</text>
						</Show>
						</box>
					</box>
				);
			}}</For>
			</scrollbox>
			<box flexDirection="column" gap={0}>
				<text fg={theme.text.muted}>↑/↓ move · Space toggle · a all · n none · v files</text>
				<text fg={theme.text.muted}>PgUp/Dn · Enter commit · p commit+push · Esc cancel</text>
			</box>
		</box>
	);
}

function topicsWithShortLists(topics: Topic[]): number[] {
	return topics.flatMap((topic, index) => topic.files.length <= MAX_VISIBLE_FILES ? [index] : []);
}

function selectTopics(context: PluginContext, topics: Topic[], messages: string[]): Promise<{ topics: Topic[]; action: SelectionAction } | undefined> {
	return new Promise((resolve) => {
		let settled = false;
		context.ui.dialog.set({ size: "xlarge", centered: true });
		context.ui.dialog.show(
			() => <TopicSelector context={context} topics={topics} messages={messages} onFinish={(selected, action) => {
				settled = true;
				if (action === "cancel") resolve(undefined);
				else resolve({ topics: selected, action });
				context.ui.dialog.clear();
			}} />,
			() => {
				if (!settled) resolve(undefined);
			},
		);
	});
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default Plugin.define({
	id: "pi-commit-split.tui",
	setup(context) {
		context.keymap.layer(() => ({
			mode: "global",
			commands: [{
				id: "pi-commit-split.run",
				title: "Split changes into commits",
				description: "Review change groups and create separate commits",
				group: "Git",
				palette: true,
				slash: { name: "commit-split", arguments: true },
				run: async (instruction = "") => {
					const location = context.location ?? context.data.location.default();
					let snapshot;
					try {
						snapshot = await inspectRepository(location.directory);
					} catch (error) {
						context.ui.toast.show({ title: "Commit split", message: errorMessage(error), variant: "error" });
						return;
					}
					const topics = snapshot.topics;
					if (!topics.length) {
						context.ui.toast.show({ message: "There are no changes to commit.", variant: "info" });
						return;
					}

					let messages: string[];
					try {
						const model = context.ui.model.current();
						if (!model) throw new Error("Select a model in OpenCode before running commit-split.");
						context.ui.toast.show({ title: "Commit split", message: "Generating commit messages with the selected model…", variant: "info" });
						const prompt = await buildCommitPrompt(snapshot, instruction);
						const response = await context.client.experimental.generate.text({ model: { providerID: model.providerID, id: model.modelID }, prompt });
						const text = response.text;
						if (!text) throw new Error("The model returned an empty response.");
						messages = parseCommitMessages(text, topics.length);
					} catch (error) {
						context.ui.toast.show({ title: "AI generation failed", message: errorMessage(error), variant: "error" });
						return;
					}
					const selection = await selectTopics(context, topics, messages);
					if (!selection) return;
					if (!selection.topics.length) {
						context.ui.toast.show({ message: "No groups selected; nothing was committed.", variant: "info" });
						return;
					}
					const selected: Array<{ topic: Topic; message: string }> = [];
					for (const topic of selection.topics) {
						const paths = topic.files.map((file) => file.path).join(", ");
						const message = await context.ui.dialog.prompt({
							title: `Commit message · ${topic.label}`,
							description: `Review and edit the AI-generated subject. Files: ${paths}`,
							value: messages[topics.indexOf(topic)],
							placeholder: "Conventional Commit subject",
						});
						if (message === undefined) return;
						if (!message.trim()) {
							context.ui.toast.show({ title: "Commit split", message: `A message is required for ${topic.label}. No commits were created.`, variant: "error" });
							return;
						}
						selected.push({ topic, message: message.trim() });
					}

					if (!selected.length) {
						context.ui.toast.show({ message: "No groups selected; nothing was committed.", variant: "info" });
						return;
					}
					try {
						await assertReviewUnchanged(snapshot);
					} catch (error) {
						context.ui.toast.show({ title: "Review changed", message: errorMessage(error), variant: "error" });
						return;
					}

					const summary = selected.map(({ topic, message }) => `${topic.label}: ${message.split("\n")[0]}`).join("\n");
					const confirmed = await context.ui.dialog.confirm({
						title: `Create ${selected.length} commit${selected.length === 1 ? "" : "s"}?`,
						message: `Repository: ${snapshot.root}\n\nReview these messages before committing:\n\n${summary}`,
						label: { confirm: "Create commits", cancel: "Cancel" },
					});
					if (!confirmed) return;
					try {
						await assertReviewUnchanged(snapshot);
					} catch (error) {
						context.ui.toast.show({ title: "Review changed", message: errorMessage(error), variant: "error" });
						return;
					}

					let committed = 0;
					for (const { topic, message } of selected) {
						try {
							const result = await commitTopic(snapshot, topic, message);
							committed++;
							if (result.stagedRemainder) {
								context.ui.toast.show({
									title: "Partial commit result",
									message: `${committed} of ${selected.length} commits succeeded. Another process staged changes during the workflow; they were not included. Review the index before continuing. No reset was run.`,
									variant: "warning",
								});
								return;
							}
						} catch (error) {
							context.ui.toast.show({
								title: committed ? "Partial commit result" : "Commit failed",
								message: `${committed} of ${selected.length} commits succeeded. Stopped at ${topic.label}: ${errorMessage(error)} Any files staged before the failure remain staged; nothing was reset.`,
								variant: "error",
							});
							return;
						}
					}

					context.ui.toast.show({ title: "Commits created", message: `${committed} commit${committed === 1 ? "" : "s"} created.`, variant: "success" });
					if (selection.action !== "push") return;
					const push = await context.ui.dialog.confirm({
						title: "Push these commits?",
						message: "The local commits are already created. Confirm separately to push the current branch.",
						label: { confirm: "Push", cancel: "Keep local" },
					});
					if (!push) return;
					try {
						await runGit(snapshot.root, ["push"]);
						context.ui.toast.show({ title: "Push complete", message: "Commits pushed successfully.", variant: "success" });
					} catch (error) {
						context.ui.toast.show({ title: "Push failed", message: `${committed} local commit${committed === 1 ? "" : "s"} remain intact. ${errorMessage(error)}`, variant: "error" });
					}
				},
			}],
		}));
	},
});
