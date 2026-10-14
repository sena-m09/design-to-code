#!/usr/bin/env node
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
import { CaptureError, captureElement } from "./lib/capture.mjs";
import { compareImages, findDiffClusters } from "./lib/compare.mjs";
import { cropToPaintedBox } from "./lib/painted-box.mjs";
import { readPng, writePng } from "./lib/png.mjs";
import { renderComparePng } from "./lib/render.mjs";
import { SUMMARY_VERSION, formatConsoleReport } from "./lib/report.mjs";
import { appendRunLog } from "./lib/run-log.mjs";

const { values } = parseArgs({
	options: {
		url: { type: "string" },
		selector: { type: "string" },
		figma: { type: "string" },
		width: { type: "string" },
		"figma-width": { type: "string" },
		height: { type: "string", default: "1080" },
		threshold: { type: "string", default: "0.02" },
		out: { type: "string" },
		wait: { type: "string", default: "300" },
		hide: { type: "string" },
		log: { type: "string" },
		tag: { type: "string" },
	},
});

function fail(message) {
	console.error(message);
	process.exit(1);
}

const required = ["url", "selector", "figma", "width"];
const missing = required.filter((key) => !values[key]);
if (missing.length > 0) {
	fail(`必須引数が不足しています: ${missing.map((k) => `--${k}`).join(", ")}`);
}

for (const [name, min] of [
	["width", 1],
	["figma-width", 1],
	["height", 1],
	["threshold", 0],
	["wait", 0],
]) {
	if (values[name] === undefined) continue;
	const value = Number(values[name]);
	if (!Number.isFinite(value) || value < min) {
		fail(`--${name} には ${min} 以上の数値を指定してください（渡された値: "${values[name]}"）`);
	}
}

const url = values.url;
const selector = values.selector;
const figmaPath = values.figma;
const width = Number(values.width);
const figmaWidth = values["figma-width"] === undefined ? width : Number(values["figma-width"]);
const height = Number(values.height);
const diffRatioThreshold = Number(values.threshold);
const wait = Number(values.wait);

// 書き出し幅だけ変えた実行どうしが同じ出力先を上書きしないよう、指定時は幅を重ねる
const figmaWidthLabel = values["figma-width"] === undefined ? "" : `-${figmaWidth}`;
const label =
	values.out ?? `${selector.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")}-${width}${figmaWidthLabel}`;

// スクリプトの置き場所ではなく、実行したプロジェクトのルートに書き出す
const outDir = join(process.cwd(), ".figma-diff", label);
mkdirSync(outDir, { recursive: true });

let figmaPng;
try {
	figmaPng = readPng(figmaPath);
} catch (error) {
	fail(`--figma の画像を PNG として読めませんでした: ${figmaPath}\n${error instanceof Error ? error.message : String(error)}`);
}
const deviceScaleFactor = figmaPng.width / figmaWidth;

let captured;
try {
	captured = await captureElement({
		url,
		selector,
		width,
		height,
		deviceScaleFactor,
		wait,
		hideSelector: values.hide,
	});
} catch (error) {
	if (error instanceof CaptureError) fail(error.message);
	throw error;
}

const screenshotPng = PNG.sync.read(captured.buffer);
const actualPng = cropToPaintedBox(screenshotPng, captured.rect, deviceScaleFactor);
const { expectedCanvas, actualCanvas, diffPng, diffPixels, totalPixels, diffRatio } = compareImages(figmaPng, actualPng);
const pass = diffRatio <= diffRatioThreshold;

writePng(join(outDir, "figma.png"), expectedCanvas);
writePng(join(outDir, "actual.png"), actualCanvas);
writePng(join(outDir, "diff.png"), diffPng);
writePng(join(outDir, "compare.png"), renderComparePng(expectedCanvas, actualCanvas, diffPng));

const summary = {
	version: SUMMARY_VERSION,
	pass,
	diffRatio,
	diffPixels,
	totalPixels,
	diffClustersCssPx: findDiffClusters(diffPng, deviceScaleFactor),
	figmaSize: { width: figmaPng.width, height: figmaPng.height },
	actualSize: { width: actualPng.width, height: actualPng.height },
	screenshotSize: { width: screenshotPng.width, height: screenshotPng.height },
	targetRectCssPx: captured.rect,
	deviceScaleFactor,
	diffRatioThreshold,
	args: { url, selector, figmaPath, width, figmaWidth, height, wait },
	timestamp: new Date().toISOString(),
};
writeFileSync(join(outDir, "summary.json"), JSON.stringify(summary, null, 2));

if (values.log) {
	appendRunLog(resolve(values.log), { summary, label, tag: values.tag, cwd: process.cwd() });
}

for (const line of formatConsoleReport(summary, outDir)) console.log(line);

process.exit(pass ? 0 : 1);
