#!/usr/bin/env node
import { lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const removing = process.argv.includes("--remove");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const binDir = join(homedir(), ".local", "bin");
const skillsDir = join(homedir(), ".claude", "skills");

const links = [
	...Object.entries(pkg.bin).map(([name, target]) => ({ path: join(binDir, name), target: join(root, target) })),
	{ path: join(skillsDir, "image-to-code"), target: join(root, ".claude", "skills", "image-to-code") },
];

function linkedTo(path) {
	try {
		const stat = lstatSync(path);
		return stat.isSymbolicLink() ? resolve(dirname(path), readlinkSync(path)) : "（リンクではないファイル）";
	} catch {
		return null;
	}
}

let skipped = 0;
for (const { path, target } of links) {
	const current = linkedTo(path);
	if (removing) {
		if (current === target) {
			unlinkSync(path);
			console.log(`消しました: ${path}`);
		}
		continue;
	}
	if (current === target) {
		console.log(`張ってあります: ${path}`);
	} else if (current === null) {
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(target, path);
		console.log(`張りました: ${path}`);
	} else {
		skipped++;
		console.log(`飛ばしました: ${path} は別のもの（${current}）を指しています。不要なら消してから、もう一度実行してください。`);
	}
}

if (!removing && !process.env.PATH.split(delimiter).includes(binDir)) {
	console.log(`\n${binDir} に PATH が通っていません。シェルの設定ファイルに export PATH="$HOME/.local/bin:$PATH" を足して、開き直してください。`);
}
if (skipped > 0) process.exitCode = 1;
