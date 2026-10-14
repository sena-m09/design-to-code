import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { fillPng } from "./png.mjs";

// 画素ごとの色差のしきい値で、diffRatio の合否を決める --threshold とは別物
const PIXELMATCH_COLOR_THRESHOLD = 0.1;

// アンチエイリアスとして黄色で塗られた画素は差分に数えない
export function isDiffPixel(data, i) {
	return data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0;
}

function padToCanvas(png, width, height) {
	const canvas = new PNG({ width, height });
	fillPng(canvas, [255, 0, 255]);
	PNG.bitblt(png, canvas, 0, 0, png.width, png.height, 0, 0);
	return canvas;
}

export function compareImages(expected, actual) {
	const width = Math.max(expected.width, actual.width);
	const height = Math.max(expected.height, actual.height);
	const expectedCanvas = padToCanvas(expected, width, height);
	const actualCanvas = padToCanvas(actual, width, height);
	const diffPng = new PNG({ width, height });
	const diffPixels = pixelmatch(expectedCanvas.data, actualCanvas.data, diffPng.data, width, height, {
		threshold: PIXELMATCH_COLOR_THRESHOLD,
	});
	const totalPixels = width * height;
	return { expectedCanvas, actualCanvas, diffPng, diffPixels, totalPixels, diffRatio: diffPixels / totalPixels };
}

const CLUSTER_CELL = 16;

function findCellClusters(diffPng) {
	const { width, height, data } = diffPng;
	const cols = Math.ceil(width / CLUSTER_CELL);
	const cellCounts = new Map();
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!isDiffPixel(data, (y * width + x) * 4)) continue;
			const idx = Math.floor(y / CLUSTER_CELL) * cols + Math.floor(x / CLUSTER_CELL);
			cellCounts.set(idx, (cellCounts.get(idx) ?? 0) + 1);
		}
	}

	const clusters = [];
	// Map の live イテレータは削除済みキーを飛ばすので、走査中の delete と併用できる
	for (const start of cellCounts.keys()) {
		const box = { count: 0, minX: Infinity, maxX: -1, minY: Infinity, maxY: -1 };
		const stack = [start];
		while (stack.length > 0) {
			const idx = stack.pop();
			if (!cellCounts.has(idx)) continue;
			box.count += cellCounts.get(idx);
			cellCounts.delete(idx);
			const cx = idx % cols;
			const cy = Math.floor(idx / cols);
			box.minX = Math.min(box.minX, cx);
			box.maxX = Math.max(box.maxX, cx);
			box.minY = Math.min(box.minY, cy);
			box.maxY = Math.max(box.maxY, cy);
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (cx + dx >= 0 && cx + dx < cols) stack.push(idx + dy * cols + dx);
				}
			}
		}
		clusters.push(box);
	}
	return clusters.sort((a, b) => b.count - a.count);
}

export function findDiffClusters(diffPng, deviceScaleFactor) {
	const minPixels = 8 * deviceScaleFactor ** 2;
	const toCssPx = (cells) => Math.round((cells * CLUSTER_CELL) / deviceScaleFactor);
	return findCellClusters(diffPng)
		.filter((c) => c.count >= minPixels)
		.map((c) => ({
			x: toCssPx(c.minX),
			y: toCssPx(c.minY),
			width: toCssPx(c.maxX - c.minX + 1),
			height: toCssPx(c.maxY - c.minY + 1),
			diffPixels: c.count,
		}));
}
