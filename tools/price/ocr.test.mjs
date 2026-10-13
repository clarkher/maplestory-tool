import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ocrImage, normalize } from "./ocr.mjs";
import { squash } from "./match.mjs";

test("normalize：PowerShell 把只有一個元素的陣列攤平時補回來", () => {
  const o = normalize({ width: 1, height: 2, meanLuma: 3, stdLuma: 4, lines: { text: "a", words: { text: "a", x: 0, y: 0, w: 1, h: 1 } } });
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].words.length, 1);
  assert.deepEqual(normalize({ width: 1, height: 1, meanLuma: 0, stdLuma: 0, lines: null }).lines, []);
});

const WIN = { skip: process.platform !== "win32" && "文字辨識只在 Windows 跑" };

/** 用系統字型畫一張假的價格圖（10/13 手動驗過的同一招）；腳本要有 BOM，PowerShell 5.1 才讀得對中文 */
function makeSynthetic(dir) {
  const png = path.join(dir, "synthetic.png");
  const ps1 = path.join(dir, "make.ps1");
  fs.writeFileSync(ps1, "\uFEFF" + `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 520,120
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(40,44,60))
$f = New-Object System.Drawing.Font("Microsoft JhengHei",11)
$g.DrawString("市價",$f,[System.Drawing.Brushes]::White,8,8)
$g.DrawString("手套攻擊卷軸10%     1,320,000     2026/10/12",$f,[System.Drawing.Brushes]::White,8,45)
$bmp.Save("${png}"); $g.Dispose(); $bmp.Dispose()
`, "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1]);
  return png;
}

test("Windows：讀得出數字跟日期、亮度統計正常", WIN, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-ocr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const o = await ocrImage(makeSynthetic(dir));
  assert.equal(o.width, 520);
  const all = squash(o.lines.map(l => l.text).join(" "));
  assert.match(all, /1,?320,?000/);
  assert.match(all, /2026\/10\/12/);
  assert.ok(o.lines[0].words[0].w > 0);
  assert.ok(o.meanLuma > 30 && o.stdLuma > 1, "不是黑畫面");
});

test("Windows：放大兩倍讀，位置換回原圖座標", WIN, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-ocr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const o = await ocrImage(makeSynthetic(dir), { scale: 2 });
  const xs = o.lines.flatMap(l => l.words).map(w => w.x + w.w);
  assert.ok(Math.max(...xs) <= 520, "座標不超出原圖寬");
});
