// Кладёт собранный плагин в волт: только то, что нужно для работы.
// Исходники, node_modules и .git в волт не попадают — там лежит
// обычная папка с файлами, которую репозиторий волта коммитит как есть
// и разносит по устройствам.
//
// Путь к волту можно переопределить: OBSIDIAN_VAULT=... npm run deploy

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

const VAULT = process.env.OBSIDIAN_VAULT
	?? "C:/assets/obsidian/obsidian-vault_12-01-2026/obsidian-vault";
const FOLDER = "obsidian-pomodoro-time-tracker";

const target = join(VAULT, ".obsidian", "plugins", FOLDER);
const root = process.cwd();

if (!existsSync(join(VAULT, ".obsidian"))) {
	console.error(`Волт не найден: ${resolve(VAULT)}`);
	console.error("Задай путь через OBSIDIAN_VAULT.");
	process.exit(1);
}

// В волте не должно остаться вложенного git-репозитория: он делает папку
// gitlink'ом, и на других устройствах она приезжает пустой.
if (existsSync(join(target, ".git"))) {
	console.error(`Внутри ${target} лежит .git — папка станет gitlink'ом.`);
	console.error("Удали вложенный клон, прежде чем деплоить.");
	process.exit(1);
}

const required = ["manifest.json", "main.js", "styles.css"];
const missing = required.filter(f => !existsSync(join(root, f)));
if (missing.length) {
	console.error(`Нет собранных файлов: ${missing.join(", ")}`);
	console.error("Сначала `npm run build`.");
	process.exit(1);
}

mkdirSync(target, { recursive: true });

const copied = [];
for (const file of required) {
	copyFileSync(join(root, file), join(target, file));
	copied.push([file, statSync(join(root, file)).size]);
}

// звуки нужны рядом с плагином: main.js грузит их по имени файла
const assets = join(root, "assets");
if (existsSync(assets)) {
	for (const file of readdirSync(assets)) {
		copyFileSync(join(assets, file), join(target, file));
		copied.push([file, statSync(join(assets, file)).size]);
	}
}

const kb = n => (n / 1024).toFixed(1).padStart(7) + " КБ";
for (const [name, size] of copied) console.log(`  ${kb(size)}  ${name}`);
console.log(`\nГотово → ${target}`);
console.log("data.json не тронут — настройки и задачи на месте.");
