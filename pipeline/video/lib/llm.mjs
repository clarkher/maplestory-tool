// Azure OpenAI：讀圖抄字、寫腳本（JSON schema）、語音轉文字（驗 TTS 用）
import { readFile } from "node:fs/promises";

/** @typedef {import("./facts.mjs").Script} Script */

const RESPONSES = "https://officialpmswedencentral.services.ai.azure.com/openai/v1/responses";
const TRANSCRIBE = "https://officialpmswedencentral.openai.azure.com/openai/deployments/gpt-4o-mini-transcribe/audio/transcriptions?api-version=2025-03-01-preview";
const MODEL = "gpt-5.4";

function key() {
  const k = process.env.AZURE_OPENAI_KEY;
  if (!k) throw new Error("缺少環境變數 AZURE_OPENAI_KEY");
  return k;
}

async function call(fetcher, url, init) {
  const res = await fetcher(url, init);
  if (!res.ok) throw new Error(`Azure ${res.status}: ${String(await res.text()).slice(0, 300)}`);
  return res.json();
}

// 優先 output_text，否則串 output[].content[] 的 output_text
function outText(j) {
  if (typeof j.output_text === "string") return j.output_text;
  return (j.output ?? []).flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text").map((c) => c.text).join("");
}

function respond(content, format, fetcher) {
  const body = { model: MODEL, store: false, input: [{ role: "user", content }] };
  if (format) body.text = { format };
  return call(fetcher, RESPONSES, {
    method: "POST",
    headers: { "api-key": key(), "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(outText);
}

const OCR_PROMPT = "逐字抄出圖上所有中文、數字、日期，不解讀、不補字，沒有字回空字串。";

export async function ocrImage(url, { fetcher = fetch } = {}) {
  return respond([{ type: "input_text", text: OCR_PROMPT }, { type: "input_image", image_url: url }], null, fetcher);
}

const str = { type: "string" };
const strs = { type: "array", items: str };
export const SCRIPT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title", "subtitle", "ticker", "cards", "narration", "shortsNarration", "ytTitle", "description", "images"],
  properties: {
    title: str, subtitle: str, ticker: strs,
    cards: { type: "array", items: { type: "object", additionalProperties: false, required: ["big", "line"], properties: { big: str, line: str } } },
    narration: strs, shortsNarration: strs, ytTitle: str, description: str, images: strs,
  },
};

const RULES = `你是「楓谷幫手」YouTube 頻道的公告快報編輯，觀眾是第一次看的台灣玩家。遊戲名稱寫「楓之谷經典版」。
規則：
1. 每個數字、日期、時間只能照抄「來源」，不可自己推算或改寫。
2. 片頭標題 title 不超過 10 字；cards 每張 big（大字）不超過 8 字，line 是一句補充。
3. narration（正片旁白）6～12 句，每句不超過 28 字；shortsNarration（Shorts 旁白）4～6 句。
4. 繁體中文台灣用字，白話口語，不寫內部術語；講玩家拿得到什麼，不講機制。
5. 不寫來源沒有的玩家評價或比較。
6. description 第一行固定為 {{LINK}}（程式會換成連結），其後是簡短說明。
7. images 只能從「可用圖片」清單挑，沒有就回空陣列。
8. 若有「延伸閱讀」，可在旁白或說明提一次站內有這一頁可看，不帶任何數字；沒有「延伸閱讀」就完全不要提站內頁。`;

export async function writeScript({ title, startDate, sourceText, site, images = [] }, { fetcher = fetch } = {}) {
  const ext = site ? `\n\n延伸閱讀（站內頁）：${site.title}——${site.summary}` : "";
  const imgs = images.length ? `\n\n可用圖片：\n${images.join("\n")}` : "";
  const text = `${RULES}\n\n公告標題：${title}\n公告日期：${startDate}\n\n來源：\n${sourceText}${ext}${imgs}`;
  const raw = await respond([{ type: "input_text", text }],
    { type: "json_schema", name: "script", schema: SCRIPT_SCHEMA, strict: true }, fetcher);
  let s;
  try { s = JSON.parse(raw); } catch { throw new Error("腳本不是合法 JSON"); }
  return validate(s);
}

function validate(s) {
  const isStrs = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const k of ["title", "subtitle", "ytTitle", "description"]) {
    if (typeof s?.[k] !== "string") throw new Error(`腳本欄位 ${k} 缺少或型別錯`);
  }
  for (const k of ["ticker", "narration", "shortsNarration", "images"]) {
    if (!isStrs(s[k])) throw new Error(`腳本欄位 ${k} 缺少或型別錯`);
  }
  if (!Array.isArray(s.cards) || !s.cards.every((c) => typeof c?.big === "string" && typeof c?.line === "string")) {
    throw new Error("腳本欄位 cards 缺少或型別錯");
  }
  return /** @type {Script} */ (s);
}

export async function transcribe(mp3Path, { fetcher = fetch } = {}) {
  const fd = new FormData();
  fd.append("file", new Blob([await readFile(mp3Path)]), "x.mp3");
  fd.append("model", "gpt-4o-mini-transcribe");
  fd.append("prompt", "以下是繁體中文（台灣用字）。");
  fd.append("response_format", "json");
  const j = await call(fetcher, TRANSCRIBE, { method: "POST", headers: { "api-key": key() }, body: fd });
  return j.text;
}
