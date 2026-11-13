import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeProject, computeTimings, segmentPlan, splitCaption, layoutDims, cardLineHtml } from "./compose.mjs";

const SCRIPT = {
  title: "楓葉商會 11/19 開跑",
  subtitle: "19 把楓葉武器，打怪掉硬幣就能換",
  ticker: ["最後掉幣 12/9", "最後能換 12/16"],
  cards: [
    { big: "11/19 開跑", line: "打怪掉楓葉硬幣" },
    { big: "19 把武器", line: "硬幣拿去換楓葉武器" },
  ],
  narration: ["楓葉商會十一月十九日開跑。", "總共有十九把楓葉武器可以換。", "完整整理在楓谷幫手。"],
  shortsNarration: ["楓葉商會開跑。"],
  ytTitle: "楓葉商會 11/19 開跑",
  description: "",
  images: [],
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "compose-test-"));
  const src = join(root, "src");
  const fonts = join(root, "fonts");
  await mkdir(src, { recursive: true });
  await mkdir(fonts, { recursive: true });
  await writeFile(join(fonts, "NotoSansTC-Black.otf"), "x");
  await writeFile(join(fonts, "NotoSansTC-Bold.otf"), "x");
  const files = {};
  for (const n of ["a.mp3", "b.mp3", "c.mp3", "s.mp3", "av1.png", "av2.png", "img1.jpg"]) {
    files[n] = join(src, n);
    await writeFile(files[n], "x");
  }
  const voice = [
    { file: files["a.mp3"], text: SCRIPT.narration[0], sec: 2.0 },
    { file: files["b.mp3"], text: SCRIPT.narration[1], sec: 3.0 },
    { file: files["c.mp3"], text: SCRIPT.narration[2], sec: 1.5 },
  ];
  const shortsVoice = [{ file: files["s.mp3"], text: SCRIPT.shortsNarration[0], sec: 1.2 }];
  return { root, fonts, files, voice, shortsVoice };
}

test("computeTimings：片頭 3 秒＋每句（秒數＋0.25）＋片尾 3 秒", () => {
  const t = computeTimings([{ sec: 2.0 }, { sec: 3.0 }, { sec: 1.5 }]);
  assert.equal(t.durationSec, 3 + (2 + 3 + 1.5) + 0.25 * 3 + 3);
  assert.deepEqual(t.starts, [3, 5.25, 8.5]);
});

test("layoutDims：正片 1920×1080、Shorts 1080×1920", () => {
  assert.deepEqual(layoutDims("main"), { width: 1920, height: 1080 });
  assert.deepEqual(layoutDims("shorts"), { width: 1080, height: 1920 });
  assert.throws(() => layoutDims("square"));
});

test("segmentPlan：先配卡片，再輪流配官方圖", () => {
  assert.deepEqual(segmentPlan(5, 2, 2), [
    { kind: "card", index: 0 },
    { kind: "card", index: 1 },
    { kind: "image", index: 0 },
    { kind: "image", index: 1 },
    { kind: "image", index: 0 },
  ]);
});

test("segmentPlan：沒有官方圖就停在最後一張卡；連卡都沒有就放標題", () => {
  assert.deepEqual(segmentPlan(3, 1, 0), [
    { kind: "card", index: 0 },
    { kind: "card", index: 0 },
    { kind: "card", index: 0 },
  ]);
  assert.deepEqual(segmentPlan(2, 0, 0), [{ kind: "title" }, { kind: "title" }]);
  assert.deepEqual(segmentPlan(2, 0, 1), [{ kind: "image", index: 0 }, { kind: "image", index: 0 }]);
});

test("splitCaption：短句一行，長句兩行且優先斷在標點後", () => {
  assert.deepEqual(splitCaption("楓葉商會開跑", 14), ["楓葉商會開跑"]);
  const two = splitCaption("楓葉商會十一月十九日開跑，打怪掉硬幣就能換楓葉武器", 14);
  assert.equal(two.length, 2);
  assert.equal(two[0], "楓葉商會十一月十九日開跑，");
  assert.ok(splitCaption("一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十", 14).length <= 2);
});

test("splitCaption：不把數字或英文字從中間切開", () => {
  for (const text of ["活動到 12/16 為止記得去換 maplehelper 看整理", "一二三四五六七八九十12/16一二三四五六七八九十"]) {
    const lines = splitCaption(text, 12);
    assert.equal(lines.length, 2);
    const a = lines[0].trimEnd().slice(-1);
    const b = lines[1].trimStart()[0];
    assert.ok(!(/[0-9A-Za-z/.]/.test(a) && /[0-9A-Za-z/.]/.test(b)), lines.join("|"));
    assert.equal(lines.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  }
});

for (const layout of ["main", "shorts"]) {
  test(`composeProject（${layout}）：時長、字幕時間、音檔、尺寸、沒有禁用字元`, async () => {
    const { root, fonts, files, voice, shortsVoice } = await fixture();
    const outDir = join(root, "out-" + layout);
    const r = await composeProject(
      {
        script: SCRIPT,
        voice,
        shortsVoice,
        images: [files["img1.jpg"]],
        avatars: [files["av1.png"], files["av2.png"]],
        date: "11/12",
        fonts,
      },
      outDir,
      layout,
    );
    const lines = layout === "main" ? voice : shortsVoice;
    const t = computeTimings(lines);
    assert.equal(r.dir, outDir);
    assert.equal(r.durationSec, t.durationSec);

    const html = await readFile(join(outDir, "index.html"), "utf8");
    const dims = layoutDims(layout);
    assert.match(html, new RegExp(`id="root"[^>]*data-duration="${t.durationSec}"`));
    assert.match(html, new RegExp(`data-width="${dims.width}"[^>]*data-height="${dims.height}"`));

    const capStarts = [...html.matchAll(/<div[^>]*class="[^"]*\bcap\b[^"]*"[^>]*data-start="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(capStarts, t.starts);
    for (let i = 1; i < capStarts.length; i++) assert.ok(capStarts[i] > capStarts[i - 1]);
    const capDurs = [...html.matchAll(/<div[^>]*class="[^"]*\bcap\b[^"]*"[^>]*data-duration="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(capDurs, lines.map((l) => l.sec));

    const audios = [...html.matchAll(/<audio[^>]*id="(vo-\d+)"[^>]*src="(assets\/[^"]+)"[^>]*data-start="([\d.]+)"/g)];
    assert.equal(audios.length, lines.length);
    assert.deepEqual(audios.map((a) => Number(a[3])), t.starts);
    for (const a of audios) await readFile(join(outDir, a[2]));

    assert.ok(!/[⌀-⏿■-◿]/u.test(html), "有 U+2300–23FF 或 U+25A0–25FF");
    assert.ok(![...html].some((c) => c.codePointAt(0) >= 0x1f300), "有 U+1F300 以上字元");
    assert.ok(!/src="\//.test(html), "素材路徑不能用 / 開頭");
    assert.match(html, /@font-face/);

    const assets = await readdir(join(outDir, "assets"));
    for (const n of ["brand-emblem.png", "map.webp"]) assert.ok(assets.includes(n), n);
    const fontFiles = await readdir(join(outDir, "assets", "fonts"));
    assert.deepEqual(fontFiles.sort(), ["NotoSansTC-Black.otf", "NotoSansTC-Bold.otf"]);
    assert.ok(html.includes("maplehelper.tw"));
    assert.ok(html.includes("官方公告 11/12"));
  });
}

test("imageSize：讀 PNG、JPEG 檔頭的長寬，讀不到回 null", async () => {
  const { imageSize } = await import("./compose.mjs");
  const png = Buffer.alloc(32);
  png.writeUInt32BE(0x89504e47, 0);
  png.writeUInt32BE(900, 16);
  png.writeUInt32BE(450, 20);
  assert.deepEqual(imageSize(png), { w: 900, h: 450 });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg), { w: 600, h: 300 });
  assert.equal(imageSize(Buffer.from("nope")), null);
});

test("ensureFonts：下載內容不是 OTF（沒有 OTTO 檔頭）就拒絕，也不留檔", async () => {
  const { ensureFonts } = await import("./compose.mjs");
  const cache = await mkdtemp(join(tmpdir(), "fonts-bad-"));
  const fetcher = async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode("<html>not a font</html>").buffer });
  await assert.rejects(() => ensureFonts(cache, { fetcher }), /不是 OTF/);
  assert.deepEqual(await readdir(join(cache, "fonts")), []);
});

test("ensureFonts：OTTO 檔頭就寫進快取，網址釘在固定 commit", async () => {
  const { ensureFonts } = await import("./compose.mjs");
  const cache = await mkdtemp(join(tmpdir(), "fonts-ok-"));
  const urls = [];
  const body = Buffer.concat([Buffer.from("OTTO"), Buffer.alloc(200_000)]);
  const fetcher = async (u) => (urls.push(u), { ok: true, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) });
  const dir = await ensureFonts(cache, { fetcher });
  assert.deepEqual((await readdir(dir)).sort(), ["NotoSansTC-Black.otf", "NotoSansTC-Bold.otf"]);
  for (const u of urls) assert.match(u, /noto-cjk\/raw\/[0-9a-f]{40}\//);
  await ensureFonts(cache, { fetcher: async () => { throw new Error("已快取不該再下載"); } });
});

test("composeProject：旁白秒數不是正數就丟錯", async () => {
  const { root, fonts, files, voice, shortsVoice } = await fixture();
  for (const bad of [0, -1, NaN, Infinity, undefined]) {
    const v = voice.map((l, i) => (i === 1 ? { ...l, sec: bad } : l));
    await assert.rejects(
      () => composeProject({ script: SCRIPT, voice: v, shortsVoice, images: [], avatars: [files["av1.png"]], date: "11/12", fonts }, join(root, "bad"), "main"),
      /秒數不對/,
    );
  }
});

test("composeProject：GSAP 用本機 assets/gsap.min.js（含授權註記），不連 CDN", async () => {
  const { root, fonts, files, voice, shortsVoice } = await fixture();
  const out = join(root, "gsap");
  await composeProject({ script: SCRIPT, voice, shortsVoice, images: [], avatars: [], date: "11/12", fonts }, out, "main");
  const html = await readFile(join(out, "index.html"), "utf8");
  assert.match(html, /<script src="assets\/gsap\.min\.js"><\/script>/);
  assert.ok(!/cdn\.jsdelivr|https?:\/\/[^"]*\.js/.test(html));
  const js = await readFile(join(out, "assets", "gsap.min.js"), "utf8");
  assert.match(js.slice(0, 400), /@license/);
  assert.match(html, /"hasAvatars":false/);
});

test("cardLineHtml：去句尾句號；太長切兩行、斷在標點，不留單一個字的尾行", () => {
  const spec = { size: 46, maxW: 864 }; // Shorts：一行約 18 字
  assert.equal(cardLineHtml("打怪掉楓葉硬幣。", spec), '<span class="ln">打怪掉楓葉硬幣</span>');
  const html = cardLineHtml("想看穿搭效果，楓谷幫手網站有紙娃娃頁面可參考。", spec);
  const lines = [...html.matchAll(/<span class="ln">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(lines, ["想看穿搭效果", "楓谷幫手網站有紙娃娃頁面可參考"]);
  assert.ok(lines.every((l) => [...l].length >= 2));
});

test("splitCaption：沒標點時不切在兩個一樣的字中間、不切開楓谷幫手網站（84140 Shorts 實例）", () => {
  // Shorts 字幕一行約 13 字
  const a = splitCaption("閃亮彗星新外觀是喵喵管家跟軟綿綿雪兔", 13);
  assert.equal(a.length, 2);
  assert.ok(!(a[0].endsWith("喵") && a[1].startsWith("喵")), a.join("|"));
  assert.ok(!(a[0].endsWith("綿") && a[1].startsWith("綿")), a.join("|"));
  assert.deepEqual(a, ["閃亮彗星新外觀是", "喵喵管家跟軟綿綿雪兔"]);
  const b = splitCaption("想先看效果，楓谷幫手網站的紙娃娃可以先試穿", 13);
  // 標點後斷的話第二行放不下，退而斷在「的」後面，楓谷幫手網站整個留在同一行
  assert.deepEqual(b, ["想先看效果，楓谷幫手網站的", "紙娃娃可以先試穿"]);
  const c = splitCaption("楓谷幫手網站的紙娃娃可以先試穿看看喔", 13);
  assert.ok(c.join("|").includes("楓谷幫手網站"), c.join("|"));
});

test("splitCaption：不切開 11/21、13:00、KKTIX 這類英數串", () => {
  const lines = splitCaption("售票從10/31 13:00開始KKTIX跟全家都能買票", 12);
  const j = lines.join("|");
  for (const tok of ["10/31", "13:00", "KKTIX"]) assert.ok(lines.some((l) => l.includes(tok)), j);
});

test("segmentPlan：補充句都拿掉、只剩結尾那句時，有官方圖就放官方圖（圖還是看得到）", () => {
  // 3 張卡＋1 句結尾（cta）＋1 張官方圖
  assert.deepEqual(segmentPlan(4, 3, 1).at(-1), { kind: "image", index: 0 });
  // 沒有官方圖就停在最後一張卡
  assert.deepEqual(segmentPlan(4, 3, 0).at(-1), { kind: "card", index: 2 });
});
