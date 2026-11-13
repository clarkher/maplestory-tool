import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { synth, heardOk, voiceLines, spokenDates } from "./voice.mjs";

test("heardOk：全形、大小寫、標點不影響", () => {
  assert.equal(heardOk("V002 開跑 10%", "v002開跑10％"), true);
});

test("heardOk：重複片段、長度比不合都拒絕", () => {
  const src = "楓葉商會十一月十九日開跑打怪就會掉硬幣";
  assert.equal(heardOk(src, src + src.slice(0, 10) + src.slice(0, 10)), false);
  assert.equal(heardOk("楓葉商會十一月十九日開跑打怪就會掉硬幣", "楓葉商會十一月"), false);
  assert.equal(heardOk("楓葉商會十一月十九日開跑", "楓葉商會十一月十九日開跑打怪就會掉硬幣"), false);
  assert.equal(heardOk(src, src), true);
});

test("heardOk：來源是空字串時，聽到的也要很短", () => {
  assert.equal(heardOk("！！", "嗯"), true);
  assert.equal(heardOk("！！", "楓葉商會開跑"), false);
});

test("synth：缺金鑰丟錯", async () => {
  const old = process.env.INWORLD_API_KEY;
  delete process.env.INWORLD_API_KEY;
  try {
    await assert.rejects(() => synth("嗨", { fetcher: async () => { throw new Error("不該呼叫"); } }), /INWORLD_API_KEY/);
  } finally {
    if (old !== undefined) process.env.INWORLD_API_KEY = old;
  }
});

test("synth：請求網址、標頭、body 與回傳", async () => {
  process.env.INWORLD_API_KEY = "dGVzdA==";
  let seen;
  const fetcher = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ audioContent: Buffer.from("MP3DATA").toString("base64") }) };
  };
  const buf = await synth("你好", { fetcher });
  assert.equal(buf.toString(), "MP3DATA");
  assert.equal(seen.url, "https://api.inworld.ai/tts/v1/voice");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers.Authorization, "Basic dGVzdA==");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
  const b = JSON.parse(seen.init.body);
  assert.equal(b.text, "[以台灣口音，親切自然的語氣] 你好");
  assert.equal(b.voiceId, "default-bwzn5blyrrl-d_slygqzww__clark_20260630");
  assert.equal(b.modelId, "inworld-tts-2");
  assert.equal(b.audioConfig.speakingRate, 1.2);
  assert.equal(b.deliveryMode, "STABLE");
});

test("synth：非 2xx 帶狀態碼、不含金鑰", async () => {
  process.env.INWORLD_API_KEY = "SECRETKEY";
  const fetcher = async () => ({ ok: false, status: 403, text: async () => "nope" });
  await assert.rejects(() => synth("嗨", { fetcher }), (e) => /403/.test(e.message) && !/SECRETKEY/.test(e.message) && e.status === 403);
});

test("voiceLines：第 1 次聽錯、第 2 次對，用第 2 次，synth 呼叫 2 次", async () => {
  const dir = join(await mkdtemp(join(tmpdir(), "vl-")), "sub");
  let n = 0;
  const heards = ["完全不相干的一段話喔喔喔", "楓葉商會開跑囉"];
  const out = await voiceLines(["楓葉商會開跑囉"], dir, {
    synth: async () => Buffer.from("audio" + ++n),
    transcribe: async () => heards[n - 1],
    probe: async () => 3.5,
  });
  assert.equal(n, 2);
  assert.equal(out.length, 1);
  assert.ok(isAbsolute(out[0].file));
  assert.ok(out[0].file.endsWith("line-01.mp3"));
  assert.equal(out[0].text, "楓葉商會開跑囉");
  assert.equal(out[0].sec, 3.5);
  assert.equal((await readFile(out[0].file)).toString(), "audio2");
});

test("voiceLines：三次都不過 → 「第 2 句配音不過：…」", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vl-"));
  let calls = 0;
  await assert.rejects(
    () => voiceLines(["第一句沒問題啦", "第二句永遠錯誤"], dir, {
      synth: async () => Buffer.from("x"),
      transcribe: async () => { calls++; return calls === 1 ? "第一句沒問題啦" : "亂講一通啊啊啊啊啊"; },
      probe: async () => 1,
    }),
    (e) => e.message === "第 2 句配音不過：第二句永遠錯誤",
  );
  assert.equal(calls, 4);
});

test("spokenDates：M/D、YYYY/M/D 念成「M月D日」，時間、小數、不合理日期不動", () => {
  assert.equal(spokenDates("11/19 開跑，到 2026/12/03 23:59"), "11月19日 開跑，到 12月3日 23:59");
  assert.equal(spokenDates("機率 1.5%，13/40 不是日期"), "機率 1.5%，13/40 不是日期");
  assert.equal(spokenDates("沒有日期"), "沒有日期");
});

test("voiceLines：spoken 只改送去念跟比對的字，字幕 text 保留原文", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vl-"));
  const said = [];
  const out = await voiceLines(["11/19 楓葉商會開跑"], dir, {
    synth: async (t) => { said.push(t); return Buffer.from("a"); },
    transcribe: async () => "十一月十九日楓葉商會開跑",
    probe: async () => 2,
    spoken: spokenDates,
  });
  assert.deepEqual(said, ["11月19日 楓葉商會開跑"]);
  assert.equal(out[0].text, "11/19 楓葉商會開跑");
});
