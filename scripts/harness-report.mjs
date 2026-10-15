#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import {
	activeMs,
	crossAccess,
	parseJsonl,
	readSession,
	resolveSessionPath,
	sessionCwd,
	sessionRange,
	tokenUsage,
	toolTimeline,
	userTurns,
} from "./lib/session-log.mjs";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		json: { type: "boolean", default: false },
	},
});

if (positionals.length === 0) {
	console.error("集計するセッションの worktree のパス（または jsonl のパス）を 1 つ以上指定してください");
	process.exit(1);
}

function readRunLog(path) {
	return existsSync(path) ? parseJsonl(readFileSync(path, "utf8")) : [];
}

const loaded = positionals.map((path) => {
	const logPath = resolveSessionPath(path);
	const rows = readSession(logPath);
	const cwd = sessionCwd(rows);
	return { name: cwd ? basename(cwd) : basename(logPath), logPath, rows, cwd };
});

const sessions = loaded.map(({ name, logPath, rows, cwd }) => {
	const range = sessionRange(rows);
	const diffRuns = cwd
		? readRunLog(join(cwd, ".figma-diff", "runs.jsonl")).filter(
				(run) => run.cwd === cwd && run.timestamp >= range.from && run.timestamp <= range.to,
			)
		: [];
	const others = loaded.filter((other) => other.logPath !== logPath && other.cwd).map((other) => other.cwd);
	return {
		name,
		logPath,
		cwd,
		range,
		activeMs: activeMs(rows),
		turns: userTurns(rows),
		tokens: tokenUsage(rows),
		timeline: toolTimeline(rows),
		crossAccess: crossAccess(rows, others),
		diffRuns: diffRuns.map(({ timestamp, tag, diffRatio, pass }) => ({ timestamp, tag, diffRatio, pass })),
	};
});

if (values.json) {
	console.log(JSON.stringify(sessions, null, 2));
	process.exit(0);
}

const time = (iso) => new Date(iso).toLocaleTimeString("ja-JP", { hour12: false });
const duration = (ms) => `${Math.floor(ms / 60000)} 分 ${Math.round((ms % 60000) / 1000)} 秒`;
const tokens = (n) => (n >= 1000 ? `${(n / 10000).toFixed(1)} 万` : String(n));
const percent = (ratio) => `${(ratio * 100).toFixed(2)}%`;
const oneLine = (text, max = 80) => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
const row = (label, cells) => `| ${label} | ${cells.join(" | ")} |`;
const laterTurns = (session) => session.turns.slice(1);

const lines = ["# ハーネスの報告", ""];
lines.push(row("", sessions.map((s) => s.name)));
lines.push(row("---", sessions.map(() => "---")));
lines.push(row("完了までの時間（入力待ちを除く）", sessions.map((s) => duration(s.activeMs))));
lines.push(
	row(
		"最初の依頼のあとの入力",
		sessions.map((s) => {
			const later = laterTurns(s);
			const prompts = later.filter((t) => t.kind === "prompt").length;
			return `${later.length} 回（プロンプト ${prompts}、コマンド ${later.length - prompts}）`;
		}),
	),
);
lines.push(row("トークンの合計（本体 + advisor）", sessions.map((s) => tokens(s.tokens.total))));
lines.push(
	row(
		"トークン: 新しく読んだ入力 / 出力",
		sessions.map((s) => `${tokens(s.tokens.main.input + s.tokens.main.cacheCreation)} / ${tokens(s.tokens.main.output)}`),
	),
);
lines.push(row("トークン: キャッシュから読んだ入力", sessions.map((s) => tokens(s.tokens.main.cacheRead))));
lines.push(
	row(
		"トークン: advisor",
		sessions.map((s) =>
			s.tokens.advisor.calls === 0
				? "なし"
				: `${s.tokens.advisor.calls} 回、入力 ${tokens(s.tokens.advisor.input)} / 出力 ${tokens(s.tokens.advisor.output)}`,
		),
	),
);
lines.push(
	row(
		"差分率の推移",
		sessions.map((s) => (s.diffRuns.length === 0 ? "記録なし" : s.diffRuns.map((r) => percent(r.diffRatio)).join(" → "))),
	),
);
lines.push(
	row(
		"最後の判定",
		sessions.map((s) => {
			const last = s.diffRuns.at(-1);
			return last ? `${last.pass ? "合格" : "不合格"}（調整 ${s.diffRuns.length - 1} 回）` : "記録なし";
		}),
	),
);
lines.push("");

if (sessions.length > 1) {
	lines.push("## 他方の worktree を読んだ記録", "");
	const hits = sessions.flatMap((s) => s.crossAccess.map((hit) => ({ ...hit, name: s.name })));
	if (hits.length === 0) lines.push("なし");
	for (const hit of hits) lines.push(`- ${hit.name}（${time(hit.at)}、${hit.tool}）: \`${oneLine(hit.input, 120)}\``);
	lines.push("");
}

lines.push("## 最初の依頼のあとの入力", "");
for (const s of sessions) {
	const later = laterTurns(s);
	const prefix = sessions.length > 1 ? `${s.name}: ` : "";
	if (later.length === 0) lines.push(`- ${prefix}なし`);
	for (const turn of later) {
		const body = turn.kind === "command" ? `/${turn.command} ${turn.text}`.trim() : turn.text;
		lines.push(`- ${prefix}${time(turn.at)} ${oneLine(body)}`);
	}
}
lines.push("");

lines.push("## ツールが使われたタイミング", "");
for (const s of sessions) {
	if (sessions.length > 1) lines.push(`### ${s.name}`, "");
	lines.push("| 時刻 | 使われたもの |", "|---|---|");
	for (const event of s.timeline) {
		const at = event.count > 1 && event.until !== event.at ? `${time(event.at)}〜${time(event.until)}` : time(event.at);
		const label = event.label === "edit" ? "ファイルの編集" : `\`${event.label}\``;
		lines.push(`| ${at} | ${label}${event.count > 1 ? ` ×${event.count}` : ""} |`);
	}
	lines.push("");
}

lines.push("## 集計に使ったログ", "");
for (const s of sessions) lines.push(`- ${s.logPath}`);

console.log(lines.join("\n"));
