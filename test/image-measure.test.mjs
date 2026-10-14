import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { findBands } from "../scripts/lib/bands.mjs";
import { probeColors } from "../scripts/lib/probe.mjs";
import { paintRect, solidPng } from "./helpers.mjs";

const LIGHT_BLUE = [229, 248, 253];
const BLUE = [0, 170, 255];

describe("probeColors", () => {
	test("CSS px で渡した位置の色を、@2x の画像から読む", () => {
		const png = paintRect(solidPng(200, 200), { x: 100, y: 100, width: 100, height: 100 }, BLUE);
		assert.deepEqual(probeColors(png, [{ x: 10, y: 10 }, { x: 60, y: 60 }], 2), [
			{ x: 10, y: 10, hex: "#ffffff", alpha: 255 },
			{ x: 60, y: 60, hex: "#00aaff", alpha: 255 },
		]);
	});
});

describe("findBands", () => {
	function sectionPage() {
		const png = solidPng(100 * 2, 120 * 2);
		paintRect(png, { x: 0, y: 80, width: 200, height: 120 }, LIGHT_BLUE);
		paintRect(png, { x: 20, y: 120, width: 160, height: 40 }, BLUE);
		return png;
	}

	test("背景の色が切り替わる位置と、要素のある範囲を CSS px で返す", () => {
		assert.deepEqual(findBands(sectionPage(), { scale: 2 }), [
			{ kind: "solid", start: 0, end: 40, size: 40, color: "#ffffff" },
			{ kind: "solid", start: 40, end: 60, size: 20, color: "#e5f8fd" },
			{ kind: "mixed", start: 60, end: 80, size: 20 },
			{ kind: "solid", start: 80, end: 100, size: 20, color: "#e5f8fd" },
			{ kind: "solid", start: 100, end: 120, size: 20, color: "#ffffff" },
		]);
	});

	test("範囲と向きを指定すると、その中の左右の余白を返す", () => {
		const bands = findBands(sectionPage(), { scale: 2, axis: "x", rect: { x: 0, y: 40, width: 100, height: 60 } });
		assert.deepEqual(bands, [
			{ kind: "solid", start: 0, end: 10, size: 10, color: "#e5f8fd" },
			{ kind: "mixed", start: 10, end: 90, size: 80 },
			{ kind: "solid", start: 90, end: 100, size: 10, color: "#e5f8fd" },
		]);
	});
});
