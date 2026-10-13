// 讀一張截圖：呼叫 ocr.ps1（Windows 內建繁中文字辨識，不花錢、不用網路、不用 AI）。
// 回傳 { width, height, meanLuma, stdLuma, lines:[{ text, words:[{ text, x, y, w, h }] }] }，座標是原圖像素。
// 10/13 用合成圖實測：數字、日期全對；中文會錯一兩個字（交給 match.mjs 的比對處理）。只能在 Windows 跑。
// 失敗一律 reject 成看得懂的中文：「文字辨識失敗：原因」，逾時、放大倍數不對是整句話。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PS1 = path.join(import.meta.dirname, "ocr.ps1");
const TIMEOUT_MS = 60_000;
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** PowerShell 5.1 的 ConvertTo-Json 會把只有一個元素的陣列攤平成物件，這裡補回陣列 */
export function normalize(j) {
  return {
    width: j.width, height: j.height, meanLuma: j.meanLuma, stdLuma: j.stdLuma,
    lines: arr(j.lines).map(l => ({ text: l.text ?? "", words: arr(l.words) })),
  };
}

/** PowerShell 的 stderr 是主控台編碼（繁中 Windows 是 Big5），不是 UTF-8；先試 UTF-8，不行就當 Big5 */
export function decodeConsole(buf) {
  if (buf == null) return "";
  if (typeof buf === "string") return buf;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("big5").decode(buf);
  }
}

const NO_LANG = "這台電腦沒有裝繁體中文文字辨識：Windows 設定 → 時間與語言 → 語言 → 中文(台灣) → 選項 → 安裝「光學字元辨識」";

/** ocr.ps1 丟出來的英文原因 → 中文 */
function explain(msg) {
  const m = String(msg).trim();
  if (m === "zh-Hant-TW OCR language is not installed") return NO_LANG;
  const nf = /^image file not found: ([\s\S]*)$/.exec(m);
  if (nf) return `找不到圖檔：${nf[1]}`;
  const bad = /^not a readable image: ([\s\S]*)$/.exec(m);
  if (bad) return `圖檔讀不開（壞掉、還沒存完，或根本不是圖片）：${bad[1]}`;
  return m;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

const rm = file => {
  try { fs.rmSync(file, { force: true }); } catch { /* 被占著就算了，下一次不會撞名 */ }
};

export function ocrImage(imagePath, { scale = 1 } = {}) {
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) return Promise.reject(new Error("文字辨識的放大倍數要是正數"));
  if (process.platform !== "win32") return Promise.reject(new Error("文字辨識只能在 Windows 跑"));
  // StorageFile.GetFileFromPathAsync 只吃「絕對路徑＋反斜線」，相對路徑、斜線都會讀不到
  const abs = path.resolve(imagePath);
  const out = path.join(os.tmpdir(), `maplebook-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-In", abs, "-Out", out, "-Scale", String(scale)];
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", args, { windowsHide: true, timeout: TIMEOUT_MS, encoding: "buffer" }, (err, _stdout, stderr) => {
      try {
        if (err?.killed) throw new Error(`文字辨識逾時（超過 ${TIMEOUT_MS / 1000} 秒）`);
        const j = readJson(out);
        if (j?.error != null) throw new Error(`文字辨識失敗：${explain(j.error)}`);
        if (err) throw new Error(`文字辨識失敗：${decodeConsole(stderr).trim() || err.message}`);
        if (!j) throw new Error("文字辨識失敗：沒有讀到辨識結果");
        resolve(normalize(j));
      } catch (e) {
        reject(e);
      } finally {
        rm(out);
        rm(`${out}.scaled.png`); // 逾時被砍掉時 ps1 來不及清放大用的暫存圖
      }
    });
  });
}
