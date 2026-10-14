import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export function readPng(path) {
	return PNG.sync.read(readFileSync(path));
}

export function writePng(path, png) {
	writeFileSync(path, PNG.sync.write(png));
}

export function fillPng(png, [r, g, b]) {
	for (let i = 0; i < png.data.length; i += 4) {
		png.data[i] = r;
		png.data[i + 1] = g;
		png.data[i + 2] = b;
		png.data[i + 3] = 255;
	}
}

export function cropPng(png, { x, y, width, height }) {
	const cropped = new PNG({ width, height });
	PNG.bitblt(png, cropped, x, y, width, height, 0, 0);
	return cropped;
}

export function pixelAt(png, x, y) {
	const i = (y * png.width + x) * 4;
	return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

export function toHex([r, g, b]) {
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
