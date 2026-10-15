import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { activeMs, crossAccess, tokenUsage, toolTimeline, userTurns } from "../scripts/lib/session-log.mjs";

const at = (seconds) => new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();

const prompt = (seconds, text) => ({ type: "user", timestamp: at(seconds), message: { role: "user", content: text } });
const reply = (seconds, { id = `m${seconds}`, usage, tools = [] } = {}) => ({
	type: "assistant",
	timestamp: at(seconds),
	message: {
		id,
		usage,
		content: tools.map(([name, input]) => ({ type: "tool_use", id: `t${seconds}${name}`, name, input })),
	},
});
const toolResult = (seconds) => ({
	type: "user",
	timestamp: at(seconds),
	message: { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }] },
});

describe("userTurns と activeMs", () => {
	test("返答を待っていた時間は、完了までの時間に数えない", () => {
		const rows = [
			prompt(0, "実装して"),
			reply(10),
			toolResult(20),
			reply(60),
			prompt(600, "<command-name>/mcp</command-name>\n<command-message>mcp</command-message>\n<command-args></command-args>"),
			prompt(600, "<local-command-stdout>Authentication successful.</local-command-stdout>"),
			prompt(620, "続けて"),
			reply(650),
			{ type: "system", timestamp: at(3000) },
		];

		assert.equal(activeMs(rows), 90_000);
		assert.deepEqual(
			userTurns(rows).map((turn) => (turn.kind === "command" ? `/${turn.command}` : turn.text)),
			["実装して", "/mcp", "続けて"],
		);
	});
});

describe("tokenUsage", () => {
	test("1 つのメッセージが複数行に分かれていても 1 回だけ数え、advisor の分は別に足す", () => {
		const usage = {
			input_tokens: 1,
			cache_creation_input_tokens: 10,
			cache_read_input_tokens: 100,
			output_tokens: 5,
			iterations: [
				{ type: "message", input_tokens: 1, output_tokens: 5 },
				{ type: "advisor_message", input_tokens: 1000, output_tokens: 50 },
			],
		};
		const rows = [reply(1, { id: "same", usage }), reply(2, { id: "same", usage })];

		const result = tokenUsage(rows);

		assert.deepEqual(result.main, { input: 1, cacheCreation: 10, cacheRead: 100, output: 5 });
		assert.deepEqual(result.advisor, { calls: 1, input: 1000, output: 50 });
		assert.equal(result.total, 116 + 1050);
	});
});

describe("toolTimeline", () => {
	test("コマンドとして実行したものだけを数え、パスや引数に出てくる名前は数えない", () => {
		const rows = [
			reply(1, { tools: [["Bash", { command: "cat .figma-diff/runs.jsonl; which figma-diff design-flow" }]] }),
			reply(2, { tools: [["Bash", { command: 'design-flow start --figma a.png --check "pnpm typecheck"' }]] }),
			reply(3, { tools: [["Bash", { command: "pnpm typecheck && figma-diff --url http://localhost:5180/" }]] }),
		];

		assert.deepEqual(
			toolTimeline(rows).map((event) => event.label),
			["design-flow start", "pnpm typecheck", "figma-diff"],
		);
	});
});

describe("crossAccess", () => {
	test("もう一方の worktree のパスを含む呼び出しだけが記録される", () => {
		const own = "/wt/exp/figma";
		const other = "/wt/exp/image";
		const rows = [
			reply(1, { tools: [["Bash", { command: `cat ${own}/src/App.tsx` }]] }),
			reply(2, { tools: [["Bash", { command: `tail -2 ${other}/.figma-diff/runs.jsonl` }]] }),
		];

		const hits = crossAccess(rows, [other]);

		assert.equal(hits.length, 1);
		assert.equal(hits[0].at, at(2));
	});
});
