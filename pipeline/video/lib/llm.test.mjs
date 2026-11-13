import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ocrImage, writeScript, transcribe } from "./llm.mjs";

const GOOD = {
  title: "閃亮彗星", subtitle: "新外觀", ticker: ["11/4 起販售"],
  cards: [{ big: "11/4", line: "起販售" }], narration: ["一句"], shortsNarration: ["一句"],
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

test("writeScript：解析 output_text JSON，prompt 含來源與延伸閱讀，schema strict", async () => {
  const { f, calls } = capture({ output_text: JSON.stringify(GOOD) });
  const s = await writeScript({ title: "T", startDate: "2026-11-04", sourceText: "來源文字ABC",
    site: { path: "/plan/avatar", title: "紙娃娃", keywords: [], summary: "先看看" } }, { fetcher: f });
  assert.deepEqual(s, GOOD);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  const text = body.input[0].content[0].text;
  assert.ok(text.includes("來源文字ABC") && text.includes("紙娃娃") && text.includes("{{LINK}}") && text.includes("楓之谷經典版"));
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
    { fetcher: respond({ output_text: JSON.stringify({ ...GOOD, narration: [1] }) }) }), /narration/);
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
