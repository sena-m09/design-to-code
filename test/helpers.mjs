import { PNG } from "pngjs";
import { fillPng } from "../scripts/lib/png.mjs";

export function solidPng(width, height, color = [255, 255, 255]) {
	const png = new PNG({ width, height });
	fillPng(png, color);
	return png;
}

export function paintRect(png, { x, y, width, height }, [r, g, b]) {
	for (let py = y; py < y + height; py++) {
		for (let px = x; px < x + width; px++) {
			const i = (py * png.width + px) * 4;
			png.data[i] = r;
			png.data[i + 1] = g;
			png.data[i + 2] = b;
			png.data[i + 3] = 255;
		}
	}
	return png;
}
