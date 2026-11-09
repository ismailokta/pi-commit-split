import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, rm, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReviewUnchanged, buildCommitPrompt, commitTopic, inspectRepository, parseCommitMessages, runGit } from "../extensions/commit-core";

let root: string;

async function git(args: string[]) {
	return runGit(root, args);
}

async function fixture(files: Record<string, string>) {
	root = await mkdtemp(join(tmpdir(), "pi-commit-split-core-"));
	await runGit(root, ["init", "-q"]);
	await runGit(root, ["config", "user.name", "Commit Split Test"]);
	await runGit(root, ["config", "user.email", "test@example.invalid"]);
	for (const [path, contents] of Object.entries(files)) {
		const absolute = join(root, path);
		await mkdir(join(absolute, ".."), { recursive: true });
		await writeFile(absolute, contents);
	}
	await runGit(root, ["add", "--", ...Object.keys(files)]);
	await runGit(root, ["commit", "-m", "test: create fixture"]);
}

describe("OpenCode commit workflow core", () => {
	beforeEach(async () => fixture({ "src/old.ts": "base source\n", "docs/guide.md": "base docs\n" }));
	afterEach(async () => rm(root, { recursive: true, force: true }));

	it("sends actual tracked and untracked changes to the model prompt", async () => {
		await writeFile(join(root, "src/old.ts"), "updated source\n");
		await writeFile(join(root, "docs/new.md"), "new documentation\n");
		const prompt = await buildCommitPrompt(await inspectRepository(root), "Indonesian");
		expect(prompt).toContain("updated source");
		expect(prompt).toContain("new documentation");
		expect(prompt).toContain("Indonesian");
	});

	it("validates one AI subject per topic", () => {
		expect(parseCommitMessages('```json\n["fix: one", "docs: two"]\n```', 2)).toEqual(["fix: one", "docs: two"]);
		expect(() => parseCommitMessages('["only one"]', 2)).toThrow();
		expect(() => parseCommitMessages('["bad\\nmessage"]', 1)).toThrow();
	});

	it("commits a worktree rename and verifies both paths with --no-renames", async () => {
		await rename(join(root, "src/old.ts"), join(root, "src/new.ts"));
		const snapshot = await inspectRepository(root);
		const topic = snapshot.topics.find((group) => group.label === "src changes");
		expect(topic).toBeDefined();
		const result = await commitTopic(snapshot, topic!, "refactor(src): rename source file");
		expect(result.stagedRemainder).toBe(false);
		const committed = (await git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"])).stdout;
		expect(committed).toContain("D\tsrc/old.ts");
		expect(committed).toContain("A\tsrc/new.ts");
		expect((await git(["status", "--porcelain"])).stdout).toBe("");
	});

	it("uses --only to keep a concurrently staged unrelated path out of the commit", async () => {
		await writeFile(join(root, "src/old.ts"), "updated source\n");
		const snapshot = await inspectRepository(root);
		const topic = snapshot.topics.find((group) => group.label === "src changes")!;
		let injected = false;
		const runner = async (cwd: string, args: string[]) => {
			if (!injected && args[0] === "commit") {
				injected = true;
				await writeFile(join(root, "docs/concurrent.md"), "concurrent work\n");
				await runGit(cwd, ["add", "--", "docs/concurrent.md"]);
			}
			return runGit(cwd, args);
		};
		const result = await commitTopic(snapshot, topic, "fix(src): update source", runner);
		expect(injected).toBe(true);
		expect(result.stagedRemainder).toBe(true);
		const committedPaths = (await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"])).stdout;
		expect(committedPaths).toBe("src/old.ts\n");
		expect((await git(["diff", "--cached", "--name-only"])).stdout).toBe("docs/concurrent.md\n");
	});

	it("refuses to commit when a reviewed worktree path changes", async () => {
		await writeFile(join(root, "src/old.ts"), "first edit\n");
		const snapshot = await inspectRepository(root);
		await writeFile(join(root, "src/old.ts"), "changed again after review\n");
		await expect(assertReviewUnchanged(snapshot)).rejects.toThrow("changed while you were reviewing");
	});

	it("refuses to start when the index already contains staged changes", async () => {
		await writeFile(join(root, "src/old.ts"), "staged edit\n");
		await git(["add", "--", "src/old.ts"]);
		await expect(inspectRepository(root)).rejects.toThrow("index contains staged changes");
	});

	it("reports added and deleted line counts for tracked and new files", async () => {
		await writeFile(join(root, "src/old.ts"), "updated\nsecond\nthird\n");
		await writeFile(join(root, "docs/new.md"), "one\ntwo\n");
		const snapshot = await inspectRepository(root);
		const source = snapshot.topics.find((group) => group.label === "src changes")!.files[0];
		const newDoc = snapshot.topics.find((group) => group.label === "docs changes")!.files[0];
		expect(source.additions).toBe(3);
		expect(source.deletions).toBe(1);
		expect(newDoc.additions).toBe(2);
		expect(newDoc.deletions).toBe(0);
	});
});
