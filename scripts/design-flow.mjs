#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { FlowError, applyMeasure, applyReport, applyVerify, createState, nextDirective } from "./lib/flow/machine.mjs";
import { workingTreeHash } from "./lib/flow/tree-hash.mjs";
import { SUMMARY_VERSION } from "./lib/report.mjs";

const USAGE = `使い方: design-flow <コマンド> [オプション]

  start   --figma <PNG> --url <URL> --selector <セレクタ> --width <設計幅> [--check <コマンド> ...]
          [--figma-width <px>] [--hide <セレクタ>] [--threshold <0-1>] [--max-adjust <回数>]
          [--wait <ミリ秒>] [--height <px>] [--tag <名前>] [--force]
                       フローを始める
  next                 次の手順を JSON で出す（状態は変えない）
  report <手順>         LLM が担当する手順を終えたと報告する
  verify               --check のコマンドを走らせて判定する
  measure              figma-diff で差分を測って判定する
  status               これまでの記録を出す`;

const cwd = process.cwd();
const flowDir = join(cwd, ".figma-diff", "flow");
const statePath = join(flowDir, "state.json");
const paths = { notes: join(flowDir, "reading.md") };
const figmaDiffPath = join(dirname(fileURLToPath(import.meta.url)), "figma-diff.mjs");

function fail(message) {
	console.error(message);
	process.exit(1);
}

function print(value) {
	console.log(JSON.stringify(value, null, 2));
}

function loadState() {
	if (!existsSync(statePath)) fail("フローが始まっていません。design-flow start で始めてください。");
	return JSON.parse(readFileSync(statePath, "utf8"));
}

function saveState(state) {
	mkdirSync(flowDir, { recursive: true });
	writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function advance(state) {
	saveState(state);
	print(nextDirective(state, paths));
}

function now() {
	return new Date().toISOString();
}

function lastLines(text, count) {
	return text.split("\n").slice(-count).join("\n");
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		figma: { type: "string" },
		url: { type: "string" },
		selector: { type: "string" },
		width: { type: "string" },
		"figma-width": { type: "string" },
		hide: { type: "string" },
		threshold: { type: "string", default: "0.02" },
		"max-adjust": { type: "string", default: "3" },
		wait: { type: "string" },
		height: { type: "string" },
		tag: { type: "string", default: "baseline" },
		check: { type: "string", multiple: true, default: [] },
		force: { type: "boolean", default: false },
	},
});

const [command, ...rest] = positionals;

try {
	switch (command) {
		case "start": {
			const missing = ["figma", "url", "selector", "width"].filter((key) => !values[key]);
			if (missing.length > 0) fail(`必須引数が不足しています: ${missing.map((k) => `--${k}`).join(", ")}`);
			for (const [name, min] of [
				["width", 1],
				["figma-width", 1],
				["threshold", 0],
				["max-adjust", 0],
				["wait", 0],
				["height", 1],
			]) {
				if (values[name] === undefined) continue;
				const value = Number(values[name]);
				if (!Number.isFinite(value) || value < min) {
					fail(`--${name} には ${min} 以上の数値を指定してください（渡された値: "${values[name]}"）`);
				}
			}
			if (!Number.isInteger(Number(values["max-adjust"]))) {
				fail(`--max-adjust には整数を指定してください（渡された値: "${values["max-adjust"]}"）`);
			}
			if (existsSync(statePath) && loadState().step !== "done" && !values.force) {
				fail("進行中のフローがあります。続けるなら design-flow next、始め直すなら --force を付けてください。");
			}
			const config = {
				figma: resolve(values.figma),
				url: values.url,
				selector: values.selector,
				width: Number(values.width),
				figmaWidth: values["figma-width"] === undefined ? undefined : Number(values["figma-width"]),
				hide: values.hide,
				threshold: Number(values.threshold),
				maxAdjust: Number(values["max-adjust"]),
				wait: values.wait === undefined ? undefined : Number(values.wait),
				height: values.height === undefined ? undefined : Number(values.height),
				tag: values.tag,
				checks: values.check,
			};
			advance(createState(config, { treeHash: workingTreeHash(cwd), now: now() }));
			break;
		}
		case "next":
			print(nextDirective(loadState(), paths));
			break;
		case "report": {
			const [step] = rest;
			if (!step) fail("report には手順の名前を渡してください（例: design-flow report implement）");
			const notesWritten = existsSync(paths.notes) && statSync(paths.notes).size > 0;
			advance(applyReport(loadState(), step, { treeHash: workingTreeHash(cwd), notesWritten, now: now() }));
			break;
		}
		case "verify": {
			const state = loadState();
			const logDir = join(flowDir, `verify-${state.verifyRuns}`);
			mkdirSync(logDir, { recursive: true });
			const results = state.config.checks.map((check, i) => {
				const run = spawnSync(check, { cwd, shell: true, encoding: "utf8" });
				const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
				const logPath = join(logDir, `${i}.log`);
				writeFileSync(logPath, output);
				return { command: check, exitCode: run.status ?? 1, logPath, tail: lastLines(output, 20) };
			});
			advance(applyVerify(state, results, { now: now() }));
			break;
		}
		case "measure": {
			const state = loadState();
			const { config } = state;
			const index = state.attempts.length;
			const label = `flow/attempt-${index}`;
			const args = [
				figmaDiffPath,
				"--url", config.url,
				"--selector", config.selector,
				"--figma", config.figma,
				"--width", String(config.width),
				"--threshold", String(config.threshold),
				"--out", label,
				"--log", join(cwd, ".figma-diff", "runs.jsonl"),
				"--tag", `${config.tag}-${state.adjustments}`,
			];
			if (config.figmaWidth !== undefined) args.push("--figma-width", String(config.figmaWidth));
			if (config.hide) args.push("--hide", config.hide);
			if (config.wait !== undefined) args.push("--wait", String(config.wait));
			if (config.height !== undefined) args.push("--height", String(config.height));
			const outDir = join(cwd, ".figma-diff", label);
			const summaryPath = join(outDir, "summary.json");
			// 始め直す前のフローの同じ回の結果が残っていると、撮影に失敗しても今回の結果として読んでしまう
			rmSync(summaryPath, { force: true });
			const run = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
			if (!existsSync(summaryPath)) {
				fail(`差分を測れませんでした。\n${run.stderr || run.stdout}`);
			}
			const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
			if (summary.version !== SUMMARY_VERSION) {
				fail(`summary.json の version が ${summary.version} で、このエンジンが読める ${SUMMARY_VERSION} と違います。`);
			}
			const attempt = {
				diffRatio: summary.diffRatio,
				pass: summary.pass,
				summaryPath,
				comparePath: join(outDir, "compare.png"),
				treeHash: workingTreeHash(cwd),
				measuredAt: summary.timestamp,
			};
			advance(applyMeasure(state, attempt, { now: now() }));
			break;
		}
		case "status": {
			const state = loadState();
			print({
				step: state.step,
				adjustments: state.adjustments,
				maxAdjust: state.config.maxAdjust,
				gaveUp: state.gaveUp,
				attempts: state.attempts.map(({ index, adjustments, diffRatio, pass }) => ({ index, adjustments, diffRatio, pass })),
				history: state.history,
			});
			break;
		}
		default:
			fail(USAGE);
	}
} catch (error) {
	if (error instanceof FlowError) fail(error.message);
	throw error;
}
