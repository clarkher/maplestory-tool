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

const TIMEOUT_MS = 120_000;

async function call(fetcher, url, init) {
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
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
    title: str, subtitle: str,
    ticker: { type: "array", description: "跑馬燈 2～4 則，每則「日期＋發生什麼」，例「11/05 維護後開賣」", items: str },
    cards: { type: "array", items: { type: "object", additionalProperties: false, required: ["big", "line"], properties: { big: str, line: str } } },
    narration: { type: "array", description: "正片旁白；第 i 句（i < 卡片數）就是念出第 i 張卡片", items: str },
    shortsNarration: { type: "array", description: "Shorts 旁白 4～6 句；前幾句對應同順序的卡片", items: str },
    ytTitle: str, description: str, images: strs,
  },
};

const RULES = `你是「楓谷幫手」YouTube 頻道的公告快報編輯，觀眾是第一次看的台灣玩家。遊戲名稱寫「楓之谷經典版」。
規則：
1. 每個數字、日期、時間只能照抄「來源」，不可自己推算或改寫。日期旁邊的「維護後／維護前／幾點」一定要一起寫（來源寫「2026/11/05 維護後~2026/11/19 維護前」，就要寫「11/05 維護後」「11/19 維護前」）。
2. 日期、數字一律寫阿拉伯數字（例：11/19、11月19日、3 張），不寫國字數字。
3. 片頭標題 title 不超過 10 字；cards 2～5 張，每張 big（大字）不超過 8 字，line 是一句補充（不加句號）。
4. 卡片跟旁白要成對：narration 第 i 句（i 小於卡片數）就是把 cards 第 i 張「念出來」，講同一件事；shortsNarration 前幾句也一樣對應同順序的卡片。卡片講完之後多的旁白配官方圖，可以補充細節。
   例：cards = [{big:"喵喵管家登場", line:"閃亮彗星新外觀"}, {big:"11/19 維護前結束", line:"想要的別拖"}]
       narration = ["閃亮彗星換新外觀了，這次是喵喵管家跟軟綿綿雪兔", "11/19 維護前就收掉，想要的別拖", …]
5. narration（正片旁白）6～12 句、每句不超過 28 字；shortsNarration（Shorts 旁白）4～6 句。來源資訊少就寫少，不要用空話湊句數。
6. 第一句直接講最大的重點，像 YouTuber 開場（例：「閃亮彗星換新外觀了，這次是喵喵管家跟軟綿綿雪兔」）。不要講「這次是快報」「歡迎收看」這種空話。台灣口語、短句、親切自然。
7. ticker（跑馬燈）2～4 則，每則是「日期＋發生什麼」，例：「11/05 維護後開賣」「11/19 維護前結束」。不要放關鍵字清單。
8. 繁體中文台灣用字，講玩家拿得到什麼，不講機制。禁用字詞：站內、快報、本公告、敬請期待。提到我們的網站一律寫「楓谷幫手網站」或「楓谷幫手的○○」。
9. 不寫來源沒有的玩家評價或比較。
10. description 第一行固定為 {{LINK}}（程式會換成連結），其後是簡短說明。
11. images 只能從「可用圖片」清單挑，沒有就回空陣列。
12. 若有「楓谷幫手網站可以看的頁面」，可在最後一兩句旁白或說明提一次，講好處（例：「想先看穿起來的樣子，楓谷幫手的紙娃娃可以直接試穿」），不帶任何數字；沒有就完全不要提網站。`;

export async function writeScript({ title, startDate, sourceText, site, images = [] }, { fetcher = fetch } = {}) {
  const ext = site ? `\n\n楓谷幫手網站可以看的頁面：${site.title}——${site.summary}` : "";
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
