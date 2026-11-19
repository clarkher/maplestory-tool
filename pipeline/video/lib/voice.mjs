// 配音與驗音：Inworld 合成 → 轉文字比對 → 最多重試。
// 金鑰只讀環境變數 INWORLD_API_KEY（值已是 base64，直接放 Basic 後面）。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const execFileP = promisify(execFile);

const URL_TTS = "https://api.inworld.ai/tts/v1/voice";
const VOICE_ID = "default-bwzn5blyrrl-d_slygqzww__clark_20260630";
const MODEL_ID = "inworld-tts-2";
const PREFIX = "[以台灣口音，親切自然的語氣] ";

// 備援（v2.38，11/19 使用者「先換別的 AI 聲音」）：Inworld 點數用完（402）就改用 Gemini 念，同一次執行之後都用 Gemini，
// 不會一支片兩種聲音；加值後下一次執行自動回到使用者的聲音。TTS_PROVIDER=gemini 可以直接指定。
const GEMINI_TTS = "gemini-3.8-flash-tts";
const GEMINI_VOICE = "Puck";
const GEMINI_STYLE = "用台灣口音的國語，親切自然、語速稍快地念出下面這段，只念內容：";
let useGemini = false;

export const voiceName = () => (useGemini || process.env.TTS_PROVIDER === "gemini" ? `gemini:${GEMINI_VOICE}` : "inworld:clark");

/** Gemini 回 24kHz 16-bit 單聲道 PCM → 用 ffmpeg 轉 mp3（跟 Inworld 一樣的檔案格式） */
export async function geminiSynth(text, { fetcher = fetch, toMp3 = pcmToMp3 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("缺少環境變數 GEMINI_API_KEY");
  const res = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: GEMINI_STYLE + text }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } } } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const e = new Error(`Gemini TTS 失敗 ${res.status}：${String(body).slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  const data = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error("Gemini TTS 回應沒有聲音");
  return toMp3(Buffer.from(data, "base64"));
}

async function pcmToMp3(pcm) {
  const { spawn } = await import("node:child_process");
  return new Promise((ok, bad) => {
    const p = spawn("ffmpeg", ["-v", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-b:a", "128k", "-f", "mp3", "pipe:1"]);
    const out = [];
    p.stdout.on("data", (d) => out.push(d));
    p.on("error", bad);
    p.on("close", (c) => (c === 0 ? ok(Buffer.concat(out)) : bad(new Error(`ffmpeg 轉 mp3 失敗 ${c}`))));
    p.stdin.end(pcm);
  });
}

export async function synth(text, opts = {}) {
  if (useGemini || process.env.TTS_PROVIDER === "gemini") return geminiSynth(text, opts);
  try {
    return await inworldSynth(text, opts);
  } catch (e) {
    if (e.status !== 402 || !process.env.GEMINI_API_KEY) throw e;
    useGemini = true;
    console.log("Inworld 配音點數用完，這次改用 Gemini 的聲音");
    return geminiSynth(text, opts);
  }
}

export async function inworldSynth(text, { fetcher = fetch } = {}) {
  const key = process.env.INWORLD_API_KEY;
  if (!key) throw new Error("缺少環境變數 INWORLD_API_KEY");
  const res = await fetcher(URL_TTS, {
    method: "POST",
    headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: PREFIX + text,
      voiceId: VOICE_ID,
      modelId: MODEL_ID,
      audioConfig: { speakingRate: 1.2 },
      deliveryMode: "STABLE",
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const e = new Error(`Inworld TTS 失敗 ${res.status}：${String(body).slice(0, 300)}`);
    e.status = res.status; // run.mjs 靠它分辨「額度／權限」錯誤
    throw e;
  }
  const j = await res.json();
  if (!j?.audioContent) throw new Error("Inworld TTS 回應沒有 audioContent");
  return Buffer.from(j.audioContent, "base64");
}

function norm(s) {
  return String(s ?? "").normalize("NFKC").replace(/[^\u4e00-\u9fff0-9]/g, "");
}

function hasRepeat(s, len = 8) {
  const seen = new Set();
  for (let i = 0; i + len <= s.length; i++) {
    const sub = s.slice(i, i + len);
    if (seen.has(sub)) return true;
    seen.add(sub);
  }
  return false;
}

// 只比長度比例與重複；轉文字偶爾回簡體，不做字形比對。
export function heardOk(src, heard) {
  const a = norm(src);
  const h = norm(heard);
  if (a.length === 0) return h.length <= 2;
  const ratio = h.length / a.length;
  if (ratio < 0.8 || ratio > 1.25) return false;
  return !hasRepeat(h);
}

async function ffprobeSec(file) {
  const { stdout } = await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const sec = parseFloat(stdout.trim());
  if (!Number.isFinite(sec)) throw new Error(`ffprobe 讀不到長度：${file}`);
  return sec;
}

const okMD = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

const okHM = (h, m) => h >= 0 && h <= 24 && m >= 0 && m <= 59;
const hm = (h, m) => (+m === 0 ? `${+h}點` : `${+h}點${+m}分`);

/** 念的時候把 M/D、YYYY/M/D 換成「M月D日」、HH:MM 換成「H點M分」、時間區間的 - 念「到」（字幕照原文；小數 1.5 不動） */
export function spokenDates(text) {
  return String(text)
    .replace(/(?<![\d:])(\d{1,2}):(\d{2})\s*[-－~～]\s*(\d{1,2}):(\d{2})(?![\d:])/g, (x, h1, m1, h2, m2) =>
      okHM(+h1, +m1) && okHM(+h2, +m2) ? `${hm(h1, m1)}到${hm(h2, m2)}` : x)
    .replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/g, (x, h, m) => (okHM(+h, +m) ? hm(h, m) : x))
    .replace(/(?<![\d/])\d{4}\/(\d{1,2})\/(\d{1,2})(?![\d/])/g, (m, mo, d) => (okMD(+mo, +d) ? `${+mo}月${+d}日` : m))
    .replace(/(?<![\d/.])(\d{1,2})\/(\d{1,2})(?![\d/])/g, (m, mo, d) => (okMD(+mo, +d) ? `${+mo}月${+d}日` : m));
}

/**
 * 逐句配音。spoken(text) 是實際送去念、拿來比對轉文字的字（例如把日期換成念法）；回傳的 text 保留原文給字幕用。
 */
export async function voiceLines(lines, dir, { synth: doSynth = synth, transcribe, tries = 3, probe = ffprobeSec, spoken = (t) => t } = {}) {
  const absDir = resolve(dir);
  await mkdir(absDir, { recursive: true });
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const file = join(absDir, `line-${String(i + 1).padStart(2, "0")}.mp3`);
    let ok = false;
    for (let t = 0; t < tries && !ok; t++) {
      const say = spoken(text);
      const buf = await doSynth(say);
      await writeFile(file, buf);
      ok = heardOk(say, await transcribe(file));
    }
    if (!ok) throw new Error(`第 ${i + 1} 句配音不過：${text}`);
    out.push({ file, text, sec: await probe(file) });
  }
  return out;
}
