import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ocrImage, normalize, decodeConsole } from "./ocr.mjs";
import { squash } from "./match.mjs";

test("normalize：PowerShell 把只有一個元素的陣列攤平時補回來", () => {
  const o = normalize({ width: 1, height: 2, meanLuma: 3, stdLuma: 4, lines: { text: "a", words: { text: "a", x: 0, y: 0, w: 1, h: 1 } } });
  assert.equal(o.lines.length, 1);
  assert.equal(o.lines[0].words.length, 1);
  assert.deepEqual(normalize({ width: 1, height: 1, meanLuma: 0, stdLuma: 0, lines: null }).lines, []);
});

test("decodeConsole：UTF-8 照讀，繁中主控台（Big5）的位元組也讀得出來", () => {
  assert.equal(decodeConsole(Buffer.from("錯誤 abc", "utf8")), "錯誤 abc");
  assert.equal(decodeConsole(Buffer.from([0xa4, 0xa4, 0xa4, 0xe5])), "中文");
  assert.equal(decodeConsole("已經是字串"), "已經是字串");
});

test("放大倍數不是正數就直接擋（哪個系統都一樣）", async () => {
  for (const scale of [0, -1, NaN, Infinity, "2"]) {
    await assert.rejects(ocrImage("x.png", { scale }), /文字辨識的放大倍數要是正數/, `scale=${String(scale)}`);
  }
});

test("非 Windows：直接 reject，講明只能在 Windows 跑", { skip: process.platform === "win32" && "只在非 Windows 驗" }, async () => {
  await assert.rejects(ocrImage("x.png"), /只能在 Windows/);
});

const WIN = { skip: process.platform !== "win32" && "文字辨識只在 Windows 跑" };

/** 寫一支有 BOM 的 PowerShell 腳本再跑（PowerShell 5.1 沒 BOM 會把中文讀壞） */
function runPs1(dir, body) {
  const ps1 = path.join(dir, `gen-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(ps1, "\uFEFF" + body, "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1]);
}

/** 用系統字型畫一張假的價格圖（10/13 手動驗過的同一招） */
function makeSynthetic(dir) {
  const png = path.join(dir, "synthetic.png");
  runPs1(dir, `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 520,120
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(40,44,60))
$f = New-Object System.Drawing.Font("Microsoft JhengHei",11)
$g.DrawString("市價",$f,[System.Drawing.Brushes]::White,8,8)
$g.DrawString("手套攻擊卷軸10%     1,320,000     2026/10/12",$f,[System.Drawing.Brushes]::White,8,45)
$bmp.Save("${png}"); $g.Dispose(); $bmp.Dispose()
`);
  return png;
}

/** 畫一張純色圖（黑畫面、超大圖用） */
function makeSolid(dir, name, w, h, rgb = [0, 0, 0]) {
  const png = path.join(dir, name);
  runPs1(dir, `
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap ${w},${h}
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(${rgb.join(",")}))
$bmp.Save("${png}"); $g.Dispose(); $bmp.Dispose()
`);
  return png;
}

/** 這個行程留在暫存資料夾的辨識檔（結果 json、放大暫存圖）；跑完應該一個都不剩 */
const leftovers = () => fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`maplebook-ocr-${process.pid}-`));

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "price-ocr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("Windows：讀得出數字跟日期、亮度統計正常", WIN, async t => {
  const dir = tmpDir(t);
  const o = await ocrImage(makeSynthetic(dir));
  assert.equal(o.width, 520);
  const all = squash(o.lines.map(l => l.text).join(" "));
  assert.match(all, /1,?320,?000/);
  assert.match(all, /2026\/10\/12/);
  assert.ok(o.lines[0].words[0].w > 0);
  assert.ok(o.meanLuma > 30 && o.stdLuma > 1, "不是黑畫面");
  assert.deepEqual(leftovers(), []);
});

test("Windows：放大兩倍讀，位置換回原圖座標", WIN, async t => {
  const dir = tmpDir(t);
  const o = await ocrImage(makeSynthetic(dir), { scale: 2 });
  const xs = o.lines.flatMap(l => l.words).map(w => w.x + w.w);
  assert.ok(xs.length > 0, "有讀到字");
  assert.ok(Math.max(...xs) <= 520, "座標不超出原圖寬");
  assert.deepEqual(leftovers(), [], "放大用的暫存圖要清掉");
});

test("Windows：純黑的圖讀得完，亮度很低、沒有字", WIN, async t => {
  const dir = tmpDir(t);
  const o = await ocrImage(makeSolid(dir, "black.png", 400, 200));
  assert.equal(o.width, 400);
  assert.ok(o.meanLuma < 30, `meanLuma=${o.meanLuma}`);
  assert.ok(o.stdLuma < 6, `stdLuma=${o.stdLuma}`);
  assert.equal(o.lines.length, 0);
});

test("Windows：斜線路徑、相對路徑都讀得到", WIN, async t => {
  const dir = tmpDir(t);
  const png = makeSynthetic(dir);
  for (const p of [png.replaceAll(path.sep, "/"), path.relative(process.cwd(), png)]) {
    const o = await ocrImage(p);
    assert.match(squash(o.lines.map(l => l.text).join(" ")), /2026\/10\/12/, p);
  }
});

test("Windows：找不到圖檔 → 看得懂的中文原因，沒有亂碼", WIN, async t => {
  const dir = tmpDir(t);
  await assert.rejects(ocrImage(path.join(dir, "nope.png")), err => {
    assert.match(err.message, /文字辨識失敗/);
    assert.match(err.message, /nope\.png/);
    assert.doesNotMatch(err.message, /\uFFFD/);
    return true;
  });
  assert.deepEqual(leftovers(), []);
});

test("Windows：不是圖片的檔案 → 講圖檔讀不開，不是「記憶體不足」", WIN, async t => {
  const dir = tmpDir(t);
  const fake = path.join(dir, "fake.png");
  fs.writeFileSync(fake, "這不是圖片", "utf8");
  await assert.rejects(ocrImage(fake), err => {
    assert.match(err.message, /^文字辨識失敗：圖檔讀不開/);
    assert.match(err.message, /fake\.png/);
    assert.doesNotMatch(err.message, /�|記憶體/);
    return true;
  });
  assert.deepEqual(leftovers(), []);
});

test("Windows：辨識本身失敗（圖太寬，放大後超過上限）→ 中文原因，放大暫存圖不外漏", WIN, async t => {
  const dir = tmpDir(t);
  const png = makeSolid(dir, "wide.png", 5200, 200, [40, 44, 60]);
  await assert.rejects(ocrImage(png, { scale: 2 }), err => {
    assert.match(err.message, /^文字辨識失敗：./);
    assert.doesNotMatch(err.message, /\uFFFD/);
    return true;
  });
  assert.deepEqual(leftovers(), [], "失敗了也要清掉暫存圖跟結果檔");
});

test("tools/price 的程式碼裡沒有看不見的字元（BOM、零寬空白、行分隔）；要寫就用跳脫寫法", () => {
  // 碼位表：零寬空白那一排、行／段分隔、窄空白一帶、字詞連接、BOM
  const invisible = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x202f, 0x2060, 0xfeff]);
  for (const name of fs.readdirSync(import.meta.dirname).filter(n => /\.(mjs|ps1)$/.test(n))) {
    const text = fs.readFileSync(path.join(import.meta.dirname, name), "utf8");
    const bad = [...text].findIndex(ch => invisible.has(ch.codePointAt(0)));
    assert.equal(bad, -1, `${name} 第 ${bad + 1} 個字是看不見的字元`);
  }
});
