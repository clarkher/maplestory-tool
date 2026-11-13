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

export async function synth(text, { fetcher = fetch } = {}) {
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
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Inworld TTS 失敗 ${res.status}：${String(body).slice(0, 300)}`);
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

export async function voiceLines(lines, dir, { synth: doSynth = synth, transcribe, tries = 3, probe = ffprobeSec } = {}) {
  const absDir = resolve(dir);
  await mkdir(absDir, { recursive: true });
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const file = join(absDir, `line-${String(i + 1).padStart(2, "0")}.mp3`);
    let ok = false;
    for (let t = 0; t < tries && !ok; t++) {
      const buf = await doSynth(text);
      await writeFile(file, buf);
      ok = heardOk(text, await transcribe(file));
    }
    if (!ok) throw new Error(`第 ${i + 1} 句配音不過：${text}`);
    out.push({ file, text, sec: await probe(file) });
  }
  return out;
}
