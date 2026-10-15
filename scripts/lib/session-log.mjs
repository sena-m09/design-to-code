import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function parseJsonl(text) {
	return text
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
}

export function projectDirFor(cwd) {
	return join(homedir(), ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

export function resolveSessionPath(path) {
	if (path.endsWith(".jsonl")) return path;
	const dir = projectDirFor(path);
	const files = readdirSync(dir)
		.filter((name) => name.endsWith(".jsonl"))
		.map((name) => join(dir, name))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
	if (files.length === 0) throw new Error(`${dir} にセッションのログがありません`);
	return files[0];
}

export function readSession(path) {
	return parseJsonl(readFileSync(path, "utf8"));
}

function textOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return null;
	const texts = content.filter((block) => block.type === "text").map((block) => block.text);
	return texts.length > 0 ? texts.join("\n") : null;
}

export function userTurns(rows) {
	const turns = [];
	for (const row of rows) {
		if (row.type !== "user" || row.isMeta) continue;
		const text = textOf(row.message?.content);
		if (text === null || text.startsWith("<local-command-stdout>")) continue;
		const command = text.match(/<command-name>\/?([^<]+)<\/command-name>/)?.[1];
		const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
		turns.push(
			command === undefined
				? { at: row.timestamp, kind: "prompt", text }
				: { at: row.timestamp, kind: "command", command, text: args ?? "" },
		);
	}
	return turns;
}

function isActivity(row) {
	if (row.type === "assistant") return true;
	return row.type === "user" && Array.isArray(row.message?.content) && row.message.content.some((b) => b.type === "tool_result");
}

export function activeMs(rows) {
	const turnTimes = new Set(userTurns(rows).map((turn) => turn.at));
	let total = 0;
	let start = null;
	let last = null;
	for (const row of rows) {
		if (!row.timestamp) continue;
		if (turnTimes.has(row.timestamp) && row.type === "user") {
			if (start !== null && last !== null) total += Date.parse(last) - Date.parse(start);
			start = row.timestamp;
			last = null;
		} else if (start !== null && isActivity(row)) {
			last = row.timestamp;
		}
	}
	if (start !== null && last !== null) total += Date.parse(last) - Date.parse(start);
	return total;
}

// ストリーミングで同じ message.id の行が複数並ぶので、1 回だけ数える。
// advisor の分はトップレベルの usage に入らず iterations にだけ載る。
export function tokenUsage(rows) {
	const main = { input: 0, cacheCreation: 0, cacheRead: 0, output: 0 };
	const advisor = { calls: 0, input: 0, output: 0 };
	const seen = new Set();
	for (const row of rows) {
		const message = row.message;
		if (row.type !== "assistant" || !message?.usage) continue;
		if (message.id) {
			if (seen.has(message.id)) continue;
			seen.add(message.id);
		}
		const usage = message.usage;
		main.input += usage.input_tokens ?? 0;
		main.cacheCreation += usage.cache_creation_input_tokens ?? 0;
		main.cacheRead += usage.cache_read_input_tokens ?? 0;
		main.output += usage.output_tokens ?? 0;
		for (const iteration of usage.iterations ?? []) {
			if (iteration.type !== "advisor_message") continue;
			advisor.calls += 1;
			advisor.input += (iteration.input_tokens ?? 0) + (iteration.cache_read_input_tokens ?? 0) + (iteration.cache_creation_input_tokens ?? 0);
			advisor.output += iteration.output_tokens ?? 0;
		}
	}
	const mainTotal = main.input + main.cacheCreation + main.cacheRead + main.output;
	return { main, advisor, total: mainTotal + advisor.input + advisor.output };
}

const SKILL_DOC = /\/skills\/([^\s/'"]+\/(?:SKILL\.md|references\/[^\s'"]+\.md))/g;
const COMMAND_START =String.raw`(?:^|[;&|\n(]\s*|\b(?:then|do)\s+)`;
const BASH_TOOLS = new RegExp(
	`${COMMAND_START}(figma-diff|design-flow \\w+|design-image \\w+|pnpm (?:typecheck|build|lint|test)|git commit)\\b`,
	"g",
);

function labelsOf(block) {
	const { name, input = {} } = block;
	if (name === "Skill") return [`skill ${input.skill}`];
	if (name.startsWith("mcp__")) return [name.replace(/^mcp__/, "")];
	if (name === "Bash") {
		const command = input.command ?? "";
		const labels = [
			...[...command.matchAll(SKILL_DOC)].map((match) => `read ${match[1]}`),
			...[...command.matchAll(BASH_TOOLS)].map((match) => match[1]),
		];
		return labels.filter((label, i) => labels.indexOf(label) === i);
	}
	if (name === "Read") {
		const doc = [...(input.file_path ?? "").matchAll(SKILL_DOC)][0]?.[1];
		return doc ? [`read ${doc}`] : [];
	}
	if (name === "Write" || name === "Edit") return ["edit"];
	return [];
}

export function toolTimeline(rows) {
	const events = [];
	const first = userTurns(rows)[0];
	if (first?.kind === "command") events.push({ at: first.at, label: `/${first.command}` });
	for (const row of rows) {
		if (row.type !== "assistant") continue;
		for (const block of row.message?.content ?? []) {
			if (block.type !== "tool_use") continue;
			for (const label of labelsOf(block)) events.push({ at: row.timestamp, label });
		}
	}
	return collapse(events);
}

function collapse(events) {
	const out = [];
	for (const event of events) {
		const prev = out.at(-1);
		if (prev && prev.label === event.label) {
			prev.count += 1;
			prev.until = event.at;
		} else {
			out.push({ ...event, count: 1, until: event.at });
		}
	}
	return out;
}

export function sessionCwd(rows) {
	return rows.find((row) => row.cwd)?.cwd ?? null;
}

export function crossAccess(rows, otherCwds) {
	const hits = [];
	for (const row of rows) {
		if (row.type !== "assistant") continue;
		for (const block of row.message?.content ?? []) {
			if (block.type !== "tool_use") continue;
			const input = JSON.stringify(block.input);
			for (const cwd of otherCwds) {
				if (input.includes(cwd)) hits.push({ at: row.timestamp, cwd, tool: block.name, input: input.slice(0, 200) });
			}
		}
	}
	return hits;
}

export function sessionRange(rows) {
	const times = rows.filter((row) => row.timestamp && (row.type === "user" || row.type === "assistant")).map((row) => row.timestamp);
	return { from: times[0] ?? null, to: times.at(-1) ?? null };
}
