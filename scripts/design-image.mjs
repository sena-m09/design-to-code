#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { findBands } from "./lib/bands.mjs";
import { probeColors } from "./lib/probe.mjs";
import { cropPng, readPng, writePng } from "./lib/png.mjs";

const USAGE = `使い方: design-image <コマンド> <PNG> [オプション]

座標と寸法はすべて CSS px で指定する。--scale は書き出しの倍率（@2x なら 2）。

  info  <PNG> [--design-width <px>]          画像の寸法。設計幅を渡すと倍率も出す
  probe <PNG> --at <x,y> [--at <x,y> ...]    指定した位置の色
  crop  <PNG> --rect <x,y,w,h> --out <PNG>   指定した範囲を切り出す
  bands <PNG> [--axis y|x] [--rect <x,y,w,h>] [--tolerance <0-255>]
                                             1 色で塗られた行（列）とそれ以外の並び`;

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		scale: { type: "string", default: "1" },
		"design-width": { type: "string" },
		at: { type: "string", multiple: true },
		rect: { type: "string" },
		out: { type: "string" },
		axis: { type: "string", default: "y" },
		tolerance: { type: "string", default: "8" },
	},
});

function fail(message) {
	console.error(message);
	process.exit(1);
}

function parseNumbers(name, text, count) {
	const numbers = text.split(",").map(Number);
	if (numbers.length !== count || numbers.some((n) => !Number.isFinite(n))) {
		fail(`--${name} には ${count} 個の数値をカンマ区切りで指定してください（渡された値: "${text}"）`);
	}
	return numbers;
}

function parseRect(text) {
	const [x, y, width, height] = parseNumbers("rect", text, 4);
	return { x, y, width, height };
}

function print(result) {
	console.log(JSON.stringify(result, null, 2));
}

const [command, imagePath] = positionals;
if (!command || !imagePath) fail(USAGE);

let png;
try {
	png = readPng(imagePath);
} catch (error) {
	fail(
		`PNG として読めませんでした: ${imagePath}\nJPG なら sips -s format png <入力> --out <出力.png> で変換してから渡してください。\n${error instanceof Error ? error.message : String(error)}`,
	);
}
const scale = Number(values.scale);
if (!Number.isFinite(scale) || scale <= 0) fail(`--scale には 0 より大きい数値を指定してください（渡された値: "${values.scale}"）`);

switch (command) {
	case "info": {
		const result = { width: png.width, height: png.height };
		if (values["design-width"] !== undefined) {
			const designWidth = Number(values["design-width"]);
			const detected = png.width / designWidth;
			Object.assign(result, { designWidth, scale: detected, cssHeight: png.height / detected });
			if (!Number.isInteger(detected)) {
				result.warning = "倍率が整数ではありません。設計幅か書き出し倍率を確かめてください";
			}
		}
		print(result);
		break;
	}
	case "probe": {
		if (!values.at?.length) fail("probe には --at <x,y> を 1 つ以上指定してください");
		const points = values.at.map((text) => {
			const [x, y] = parseNumbers("at", text, 2);
			return { x, y };
		});
		print(probeColors(png, points, scale));
		break;
	}
	case "crop": {
		if (!values.rect || !values.out) fail("crop には --rect と --out を指定してください");
		const rect = parseRect(values.rect);
		const area = {
			x: Math.round(rect.x * scale),
			y: Math.round(rect.y * scale),
			width: Math.round(rect.width * scale),
			height: Math.round(rect.height * scale),
		};
		if (area.x < 0 || area.y < 0 || area.x + area.width > png.width || area.y + area.height > png.height) {
			fail(`--rect が画像の外にはみ出しています（画像は CSS px で ${png.width / scale}x${png.height / scale}）`);
		}
		const out = resolve(values.out);
		writePng(out, cropPng(png, area));
		print({ out, width: area.width, height: area.height });
		break;
	}
	case "bands": {
		if (values.axis !== "y" && values.axis !== "x") fail('--axis には "y" か "x" を指定してください');
		print(
			findBands(png, {
				axis: values.axis,
				rect: values.rect ? parseRect(values.rect) : undefined,
				scale,
				tolerance: Number(values.tolerance),
			}),
		);
		break;
	}
	default:
		fail(`不明なコマンドです: ${command}\n\n${USAGE}`);
}
