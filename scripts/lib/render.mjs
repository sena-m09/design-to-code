import { PNG } from "pngjs";
import { isDiffPixel } from "./compare.mjs";
import { fillPng } from "./png.mjs";

const COMPARE_PANE_WIDTH = 400;
const COMPARE_MAX_HEIGHT = 1000;

function downscale(png, scale) {
	if (scale >= 1) return png;
	const outWidth = Math.max(1, Math.round(png.width * scale));
	const outHeight = Math.max(1, Math.round(png.height * scale));
	const out = new PNG({ width: outWidth, height: outHeight });
	for (let y = 0; y < outHeight; y++) {
		for (let x = 0; x < outWidth; x++) {
			const sx = Math.min(png.width - 1, Math.floor(x / scale));
			const sy = Math.min(png.height - 1, Math.floor(y / scale));
			out.data.set(png.data.subarray((sy * png.width + sx) * 4, (sy * png.width + sx) * 4 + 4), (y * outWidth + x) * 4);
		}
	}
	return out;
}

// 縮小すると細い差分線が間引かれて消える
function markDiffRed(source, scaled, scale) {
	for (let y = 0; y < source.height; y++) {
		for (let x = 0; x < source.width; x++) {
			if (!isDiffPixel(source.data, (y * source.width + x) * 4)) continue;
			const ox = Math.min(scaled.width - 1, Math.floor(x * scale));
			const oy = Math.min(scaled.height - 1, Math.floor(y * scale));
			const o = (oy * scaled.width + ox) * 4;
			scaled.data[o] = 255;
			scaled.data[o + 1] = 0;
			scaled.data[o + 2] = 0;
		}
	}
}

function compositeRow(pngs, separator = 4) {
	const outWidth = pngs.reduce((sum, p) => sum + p.width, 0) + separator * (pngs.length - 1);
	const outHeight = Math.max(...pngs.map((p) => p.height));
	const out = new PNG({ width: outWidth, height: outHeight });
	fillPng(out, [128, 128, 128]);
	let offsetX = 0;
	for (const p of pngs) {
		PNG.bitblt(p, out, 0, 0, p.width, p.height, offsetX, 0);
		offsetX += p.width + separator;
	}
	return out;
}

export function renderComparePng(expectedCanvas, actualCanvas, diffPng) {
	const scale = Math.min(1, COMPARE_PANE_WIDTH / diffPng.width, COMPARE_MAX_HEIGHT / diffPng.height);
	const diffPane = downscale(diffPng, scale);
	if (scale < 1) markDiffRed(diffPng, diffPane, scale);
	return compositeRow([downscale(expectedCanvas, scale), downscale(actualCanvas, scale), diffPane]);
}
