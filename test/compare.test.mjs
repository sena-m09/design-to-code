import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { compareImages, findDiffClusters } from "../scripts/lib/compare.mjs";
import { paintRect, solidPng } from "./helpers.mjs";

const BLUE = [0, 170, 255];

describe("compareImages", () => {
	test("同じ画像どうしなら差分率は 0 になる", () => {
		const a = paintRect(solidPng(100, 100), { x: 10, y: 10, width: 40, height: 40 }, BLUE);
		const b = paintRect(solidPng(100, 100), { x: 10, y: 10, width: 40, height: 40 }, BLUE);
		assert.equal(compareImages(a, b).diffRatio, 0);
	});

	test("矩形が 1px ずれると、ずれた分の画素だけが差分になる", () => {
		const a = paintRect(solidPng(100, 100), { x: 10, y: 10, width: 40, height: 40 }, BLUE);
		const b = paintRect(solidPng(100, 100), { x: 11, y: 10, width: 40, height: 40 }, BLUE);
		const { diffPixels } = compareImages(a, b);
		assert.equal(diffPixels, 80);
	});

	test("実装の画像が短いと、足りない高さの分が差分に数えられる", () => {
		const expected = solidPng(100, 100);
		const actual = solidPng(100, 60);
		const { diffPixels, totalPixels } = compareImages(expected, actual);
		assert.equal(totalPixels, 100 * 100);
		assert.equal(diffPixels, 100 * 40);
	});
});

describe("findDiffClusters", () => {
	test("離れた 2 か所の差分は、差分量の大きい順に別々の範囲として CSS px で返る", () => {
		const expected = solidPng(400, 400);
		const actual = solidPng(400, 400);
		paintRect(actual, { x: 0, y: 0, width: 64, height: 64 }, BLUE);
		paintRect(actual, { x: 320, y: 320, width: 32, height: 32 }, BLUE);
		const { diffPng } = compareImages(expected, actual);

		const clusters = findDiffClusters(diffPng, 2);

		assert.deepEqual(
			clusters.map(({ x, y, width, height }) => ({ x, y, width, height })),
			[
				{ x: 0, y: 0, width: 32, height: 32 },
				{ x: 160, y: 160, width: 16, height: 16 },
			],
		);
	});

	test("数画素だけの差分はノイズとして返さない", () => {
		const expected = solidPng(100, 100);
		const actual = paintRect(solidPng(100, 100), { x: 50, y: 50, width: 2, height: 2 }, BLUE);
		const { diffPng } = compareImages(expected, actual);
		assert.deepEqual(findDiffClusters(diffPng, 1), []);
	});
});
