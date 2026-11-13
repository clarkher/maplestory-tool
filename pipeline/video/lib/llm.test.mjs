import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ocrImage, writeScript, transcribe, OCR_PROMPT } from "./llm.mjs";

const GOOD = {
  title: "閃亮彗星", subtitle: "新外觀", ticker: ["11/4 起販售"],
  cards: [{ big: "11/4", line: "起販售", say: "11/4 起開賣", shortsSay: "11/4 開賣" }], moreNarration: ["補一句"], moreShorts: [],
  ytTitle: "標題", description: "{{LINK}}\n內文", images: [],
};
// writeScript 攤平後：卡片念的那句排在 narration 最前面
const FLAT = {
  title: "閃亮彗星", subtitle: "新外觀", ticker: ["11/4 起販售"],
  cards: [{ big: "11/4", line: "起販售" }], narration: ["11/4 起開賣", "補一句"], shortsNarration: ["11/4 開賣"],
  ytTitle: "標題", description: "{{LINK}}\n內文", images: [],
};
const respond = (body, ok = true, status = 200) => async () => ({
  ok, status, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});
const capture = (body) => {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init }); return respond(body)(); };
  return { f, calls };
};

test.beforeEach(() => { process.env.AZURE_OPENAI_KEY = "test-key"; });

test("ocrImage：input_image 帶網址、store:false、api-key 無 Authorization", async () => {
  const { f, calls } = capture({ output_text: "11/4" });
  const out = await ocrImage("https://x/y.jpg", { fetcher: f });
  assert.equal(out, "11/4");
  const { url, init } = calls[0];
  assert.match(url, /services\.ai\.azure\.com\/openai\/v1\/responses$/);
  const body = JSON.parse(init.body);
  assert.equal(body.store, false);
  assert.equal(body.model, "gpt-5.4");
  const parts = body.input[0].content;
  assert.ok(parts.some((p) => p.type === "input_image" && p.image_url === "https://x/y.jpg"));
  const keys = Object.keys(init.headers).map((k) => k.toLowerCase());
  assert.ok(keys.includes("api-key"));
  assert.ok(!keys.includes("authorization"));
});

test("缺金鑰丟明確錯誤", async () => {
  delete process.env.AZURE_OPENAI_KEY;
  await assert.rejects(ocrImage("u", { fetcher: respond({}) }), /AZURE_OPENAI_KEY/);
});

test("ocrImage：沒有 output_text 時串 output[].content[]", async () => {
  const { f } = capture({ output: [{ content: [{ type: "output_text", text: "甲" }, { type: "output_text", text: "乙" }] }] });
  assert.equal(await ocrImage("u", { fetcher: f }), "甲乙");
});

test("writeScript：解析 output_text JSON，prompt 含來源、不給模型網站頁面，schema strict", async () => {
  const { f, calls } = capture({ output_text: JSON.stringify(GOOD) });
  const s = await writeScript({ title: "T", startDate: "2026-11-04", sourceText: "來源文字ABC",
    site: { path: "/plan/avatar", title: "紙娃娃", keywords: [], summary: "先看看" } }, { fetcher: f });
  assert.deepEqual(s, FLAT);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  const text = body.input[0].content[0].text;
  assert.ok(text.includes("來源文字ABC") && !text.includes("先看看") && text.includes("{{LINK}}") && text.includes("楓之谷經典版"));
});

test("writeScript：site 可為 null", async () => {
  const { f } = capture({ output_text: JSON.stringify(GOOD) });
  await writeScript({ title: "T", startDate: "d", sourceText: "s", site: null }, { fetcher: f });
});

test("writeScript：缺欄位或型別錯 reject", async () => {
  const bad = { ...GOOD }; delete bad.ytTitle;
  await assert.rejects(writeScript({ title: "T", startDate: "d", sourceText: "s", site: null },
    { fetcher: respond({ output_text: JSON.stringify(bad) }) }), /ytTitle/);
  await assert.rejects(writeScript({ title: "T", startDate: "d", sourceText: "s", site: null },
    { fetcher: respond({ output_text: JSON.stringify({ ...GOOD, cards: [{ big: "a" }] }) }) }), /cards/);
  await assert.rejects(writeScript({ title: "T", startDate: "d", sourceText: "s", site: null },
    { fetcher: respond({ output_text: JSON.stringify({ ...GOOD, moreNarration: [1] }) }) }), /moreNarration/);
});

test("非 OK 回應 reject，含狀態碼", async () => {
  await assert.rejects(ocrImage("u", { fetcher: respond("boom", false, 429) }), /429.*boom/s);
});

test("transcribe：multipart 帶 prompt，回傳 text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "llm-"));
  const p = join(dir, "a.mp3");
  await writeFile(p, Buffer.from([1, 2, 3]));
  const { f, calls } = capture({ text: "你好" });
  assert.equal(await transcribe(p, { fetcher: f }), "你好");
  const { url, init } = calls[0];
  assert.match(url, /gpt-4o-mini-transcribe\/audio\/transcriptions\?api-version=2025-03-01-preview$/);
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get("prompt"), "以下是繁體中文（台灣用字）。");
  assert.equal(init.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(init.body.get("response_format"), "json");
  assert.ok(init.body.get("file") instanceof Blob);
  assert.ok(!Object.keys(init.headers).some((k) => k.toLowerCase() === "content-type"));
});

test("writeScript：prompt 寫卡片旁白成對、跑馬燈日期＋事件、維護後／前、禁用「站內」，請求帶逾時", async () => {
  const { f, calls } = capture({ output_text: JSON.stringify(GOOD) });
  await writeScript({ title: "T", startDate: "d", sourceText: "s", site: { path: "/x", title: "紙娃娃", keywords: [], summary: "試穿" } }, { fetcher: f });
  const text = JSON.parse(calls[0].init.body).input[0].content[0].text;
  for (const k of ["成對", "跑馬燈", "維護後", "禁用字詞：站內", "完全不要提「楓谷幫手」", "阿拉伯數字", "不超過 22 字", "不超過 16 字"]) assert.ok(text.includes(k), k);
  assert.ok(!/延伸閱讀（站內頁）/.test(text));
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("OCR_PROMPT：要抄日期旁的維護後／維護前、同一行同一行", () => {
  for (const k of ["維護後", "維護前", "同一行", "最小的字"]) assert.ok(OCR_PROMPT.includes(k), k);
});

test("writeScript：卡片少了 say 就 reject；攤平後 narration[i] 就是第 i 張卡片念的", async () => {
  const noSay = { ...GOOD, cards: [{ big: "a", line: "b", shortsSay: "c" }] };
  await assert.rejects(writeScript({ title: "T", startDate: "d", sourceText: "s", site: null },
    { fetcher: respond({ output_text: JSON.stringify(noSay) }) }), /cards/);
  const two = { ...GOOD, cards: [GOOD.cards[0], { big: "B", line: "L", say: "念B", shortsSay: "短B" }], moreShorts: ["多一句"] };
  const s = await writeScript({ title: "T", startDate: "d", sourceText: "s", site: null }, { fetcher: respond({ output_text: JSON.stringify(two) }) });
  assert.deepEqual(s.narration, ["11/4 起開賣", "念B", "補一句"]);
  assert.deepEqual(s.shortsNarration, ["11/4 開賣", "短B", "多一句"]);
  assert.deepEqual(s.cards, [{ big: "11/4", line: "起販售" }, { big: "B", line: "L" }]);
});

test("RULES：跑馬燈動詞也照抄來源", async () => {
  const { f, calls } = capture({ output_text: JSON.stringify(GOOD) });
  await writeScript({ title: "T", startDate: "d", sourceText: "s" }, { fetcher: f });
  const text = JSON.parse(calls[0].init.body).input[0].content[0].text;
  assert.ok(text.includes("動詞也照抄來源"));
  assert.ok(!text.includes("維護後開賣"));
});
