/**
 * publish job 推上 fx-data 之前檢查 collect 產的 artifact：collect 跑過外站的內容，publish 只當資料收。
 * 只准 fx/scania/ 底下那三個一般檔案（不能有連結、隱藏檔、多的檔），每個都讀得懂，
 * .jsonl 必須是舊內容原封不動接上新的（歷史只會變長）。全部用 readFileSync＋JSON.parse，不 require、不 import。
 */
import fs from "node:fs";
import path from "node:path";
import { DIR, FILES } from "./run.mjs";

const EXPECTED = FILES.map(name => `${DIR}/${name}`).sort();
const STATIC_FILES = ["README.md", "vercel.json"];

function listAll(root, dir = "") {
  const entries = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...listAll(root, rel));
    else entries.push(entry.isFile() ? rel : `${rel}（不是一般檔案）`);
  }
  return entries;
}

function parse(name, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} 讀不懂：${error.message}`);
  }
}

export function checkArtifact(outDir, branchDir) {
  const actual = listAll(outDir).sort();
  if (actual.join("\n") !== EXPECTED.join("\n")) throw new Error(`artifact 檔案不對：${actual.join("、")}（應該只有 ${EXPECTED.join("、")}）`);

  const read = name => fs.readFileSync(path.join(outDir, DIR, name), "utf8");
  for (const name of FILES.filter(file => file.endsWith(".jsonl"))) {
    const text = read(name);
    text.split("\n").filter(line => line.trim()).forEach((line, index) => parse(`${name} 第 ${index + 1} 行`, line));
    const oldFile = path.join(branchDir, DIR, name);
    if (fs.existsSync(oldFile) && !text.startsWith(fs.readFileSync(oldFile, "utf8"))) throw new Error(`${name} 只能接在後面，舊的內容被改了`);
  }
  const latest = parse("latest.json", read("latest.json"));
  if (!(Number.isFinite(latest?.ask100) && latest.ask100 > 0)) throw new Error("latest.json 的 ask100 不是有限的正數");
  const daily = parse("daily.json", read("daily.json"));
  if (!Array.isArray(daily?.days)) throw new Error("daily.json 沒有 days 陣列");
}

export function installArtifact(outDir, branchDir, staticDir) {
  fs.mkdirSync(path.join(branchDir, DIR), { recursive: true });
  for (const name of FILES) fs.copyFileSync(path.join(outDir, DIR, name), path.join(branchDir, DIR, name));
  for (const name of STATIC_FILES) fs.copyFileSync(path.join(staticDir, name), path.join(branchDir, name));
}
