import { pixelAt, toHex } from "./png.mjs";

export function probeColors(png, points, scale = 1) {
	return points.map(({ x, y }) => {
		const px = Math.min(png.width - 1, Math.round(x * scale));
		const py = Math.min(png.height - 1, Math.round(y * scale));
		const rgba = pixelAt(png, px, py);
		return { x, y, hex: toHex(rgba), alpha: rgba[3] };
	});
}
