// 讀一張截圖：呼叫 ocr.ps1（Windows 內建繁中文字辨識，不花錢、不用網路、不用 AI）。
// 回傳 { width, height, meanLuma, stdLuma, lines:[{ text, words:[{ text, x, y, w, h }] }] }，座標是原圖像素。
// 10/13 用合成圖實測：數字、日期全對；中文會錯一兩個字（交給 match.mjs 的比對處理）。只能在 Windows 跑。
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PS1 = path.join(import.meta.dirname, "ocr.ps1");
const arr = x => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** PowerShell 5.1 的 ConvertTo-Json 會把只有一個元素的陣列攤平成物件，這裡補回陣列 */
export function normalize(j) {
  return {
    width: j.width, height: j.height, meanLuma: j.meanLuma, stdLuma: j.stdLuma,
    lines: arr(j.lines).map(l => ({ text: l.text ?? "", words: arr(l.words) })),
  };
}

export function ocrImage(imagePath, { scale = 1 } = {}) {
  if (process.platform !== "win32") return Promise.reject(new Error("文字辨識只能在 Windows 跑"));
  const out = path.join(os.tmpdir(), `maplebook-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-In", imagePath, "-Out", out, "-Scale", String(scale)];
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", args, { windowsHide: true, timeout: 60_000 }, (err, _stdout, stderr) => {
      try {
        if (err) throw new Error(`文字辨識失敗：${String(stderr || err.message).trim()}`);
        resolve(normalize(JSON.parse(fs.readFileSync(out, "utf8").replace(/^\uFEFF/, ""))));
      } catch (e) {
        reject(e);
      } finally {
        fs.rmSync(out, { force: true });
      }
    });
  });
}
