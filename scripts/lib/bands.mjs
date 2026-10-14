import { pixelAt, toHex } from "./png.mjs";

function sameColor(a, b, tolerance) {
	return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
}

function scanLine(png, axis, position, rect, tolerance) {
	const at = (offset) => (axis === "y" ? pixelAt(png, rect.x + offset, position) : pixelAt(png, position, rect.y + offset));
	const length = axis === "y" ? rect.width : rect.height;
	const first = at(0);
	for (let offset = 1; offset < length; offset++) {
		if (!sameColor(first, at(offset), tolerance)) return { solid: false };
	}
	return { solid: true, color: first };
}

// rect と返す座標は画像 px ではなく CSS px
export function findBands(png, { axis = "y", rect, scale = 1, tolerance = 8 } = {}) {
	const area = rect
		? {
				x: Math.round(rect.x * scale),
				y: Math.round(rect.y * scale),
				width: Math.round(rect.width * scale),
				height: Math.round(rect.height * scale),
			}
		: { x: 0, y: 0, width: png.width, height: png.height };
	const start = axis === "y" ? area.y : area.x;
	const end = start + (axis === "y" ? area.height : area.width);

	const runs = [];
	for (let position = start; position < end; position++) {
		const line = scanLine(png, axis, position, area, tolerance);
		const last = runs.at(-1);
		const continues =
			last && last.solid === line.solid && (!line.solid || sameColor(last.color, line.color, tolerance));
		if (continues) {
			last.end = position + 1;
		} else {
			runs.push({ ...line, start: position, end: position + 1 });
		}
	}

	const toCss = (px) => Math.round((px / scale) * 100) / 100;
	return runs.map((run) => ({
		kind: run.solid ? "solid" : "mixed",
		start: toCss(run.start),
		end: toCss(run.end),
		size: toCss(run.end - run.start),
		...(run.solid ? { color: toHex(run.color) } : {}),
	}));
}
