import assert from "node:assert/strict";
import { test } from "node:test";
import { cropToPaintedBox } from "../scripts/lib/painted-box.mjs";
import { solidPng } from "./helpers.mjs";

test("小数の位置にある対象は、描画された範囲だけに切り出される", () => {
	const screenshot = solidPng(121 * 2, 50 * 2);
	const rect = { left: 10.5, top: 0, right: 130.6, bottom: 50 };

	const cropped = cropToPaintedBox(screenshot, rect, 2);

	assert.deepEqual({ width: cropped.width, height: cropped.height }, { width: 240, height: 100 });
});

test("整数の位置にある対象は、撮影結果の寸法のまま返る", () => {
	const screenshot = solidPng(200, 100);
	const cropped = cropToPaintedBox(screenshot, { left: 0, top: 0, right: 100, bottom: 50 }, 2);
	assert.deepEqual({ width: cropped.width, height: cropped.height }, { width: 200, height: 100 });
});

test("倍率が整数でないときは、小数の位置でも切り出さない", () => {
	const screenshot = solidPng(182, 75);
	const cropped = cropToPaintedBox(screenshot, { left: 10.5, top: 0, right: 130.6, bottom: 50 }, 1.5);
	assert.equal(cropped, screenshot);
});
