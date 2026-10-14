import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function currentCommit(cwd) {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return null;
	}
}

export function appendRunLog(logPath, { summary, label, tag, cwd }) {
	const entry = {
		timestamp: summary.timestamp,
		cwd,
		commit: currentCommit(cwd),
		label,
		tag: tag ?? null,
		pass: summary.pass,
		diffRatio: summary.diffRatio,
		figmaPath: resolve(cwd, summary.args.figmaPath),
		selector: summary.args.selector,
		width: summary.args.width,
		figmaWidth: summary.args.figmaWidth,
	};
	mkdirSync(dirname(logPath), { recursive: true });
	appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}
