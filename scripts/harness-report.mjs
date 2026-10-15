#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { renderHtml } from "./lib/report-html.mjs";
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

process.stdout.write(renderHtml(sessions));
