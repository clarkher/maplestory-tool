import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDescription, capTitle, youtubeText } from "../make.mjs";
import { parseYoutubeTxt, youtubeProblems } from "../lib/youtube.mjs";
import { parseMob, parseGo, mobScript, goScript, pickDrops, spokenFix } from "./facts.mjs";

const fx = (f) => readFileSync(join(import.meta.dirname, "__fixtures__", f), "utf8");

test("parseMob：殭屍菇菇頁（11/17 正式站）", () => {
  const f = parseMob(fx("mob-2230101.txt"));
  assert.equal(f.name, "殭屍菇菇");
  assert.deepEqual([f.lv, f.hp, f.exp, f.undead], [24, 500, 42, true]);
  assert.deepEqual(f.weak, ["聖"]);
  assert.equal(f.mapCount, 10);
  assert.deepEqual(f.maps[0], { name: "螞蟻洞Ⅲ", n: 62 });
  assert.equal(f.maps.length, 10);
  assert.equal(f.dropCount, 23);
  assert.equal(f.drops.at(-1), "永不熄滅的生命意志");
});

test("mobScript：第一句就給答案，跟手做那集一樣", () => {
  const s = mobScript(parseMob(fx("mob-2230101.txt")), { link: "L" });
  assert.equal(s.shortsNarration[0], "殭屍菇菇最多在螞蟻洞Ⅲ，62 個刷怪點，差不多是第 2 名的 2 倍。");
  assert.equal(s.narration[2], "牠是 24 等、HP 500、經驗 42，而且是不死系，怕聖屬性。");
  assert.match(s.ytTitle, /^楓之谷經典版 殭屍菇菇在哪打？最多在螞蟻洞Ⅲ/);
  assert.equal(s.narration.length, s.shortsNarration.length + 1);
});

test("mobScript：只有 1 張圖、沒弱點、沒掉落", () => {
  const s = mobScript({ name: "甲", lv: 5, hp: 10, exp: 2, undead: false, weak: [], maps: [{ name: "乙", n: 3 }], mapCount: 1, drops: [], dropCount: 0 }, { link: "L" });
  assert.deepEqual(s.shortsNarration.slice(0, 3), ["甲最多在乙，3 個刷怪點。", "牠只出現在這 1 張圖。", "牠是 5 等、HP 10、經驗 2。"]);
  const w = mobScript({ name: "綠水靈", lv: 6, hp: 50, exp: 10, undead: false, weak: ["雷"], maps: [{ name: "乙", n: 3 }], mapCount: 1, drops: ["褲、裙防禦卷軸10%"], dropCount: 1 }, { link: "L" });
  assert.equal(w.narration[2], "牠是 6 等、HP 50、經驗 10，怕雷屬性。");
  assert.equal(w.narration[3], "掉落物有 1 樣，像「褲、裙防禦卷軸10%」，官方沒有公開機率。");
  assert.ok(!s.narration.some((l) => l.includes("掉落物")));
});

test("pickDrops：卷軸、卡先講，藥水箭矢不講，不夠用前面的裝備補", () => {
  assert.deepEqual(pickDrops(["褐色洛基頭巾", "紅色藥水", "披風生命卷軸60%", "箭矢", "菇菇仔卡", "幫助尤娜"]), ["褐色洛基頭巾", "披風生命卷軸60%", "菇菇仔卡"]);
});

test("parseGo＋goScript：螞蟻洞Ⅰ（11/17 正式站）", () => {
  const f = parseGo(fx("go-105050000.txt"));
  assert.equal(f.from, "弓箭手村");
  assert.equal(f.to, "螞蟻洞Ⅰ");
  assert.equal(f.steps.length, 5);
  assert.deepEqual(f.steps[3], { map: "黑森林通道", say: "走右邊的傳送門", next: "奇幻村" });
  const s = goScript(f, { link: "L" });
  assert.equal(s.narration[0], "螞蟻洞Ⅰ怎麼去？從弓箭手村出發，一共 5 段、經過 6 張圖。");
  assert.equal(s.narration[5], "第 5 段，在奇幻村走最右邊的傳送門，就到螞蟻洞Ⅰ了。");
});

test("goScript：NPC 送的那一段", () => {
  const s = goScript({ from: "冰原雪域", to: "尖銳的絕壁Ⅰ", steps: [{ map: "冰雪峽谷Ⅰ", say: "走右邊的傳送門", next: "冰雪峽谷Ⅱ" }, { map: "冰雪峽谷Ⅱ", say: "跟最上面的傑夫說話，他會送你到", next: "尖銳的絕壁Ⅰ" }] }, { link: "L" });
  assert.equal(s.narration[2], "第 2 段，在冰雪峽谷Ⅱ跟最上面的傑夫說話，他會送你到尖銳的絕壁Ⅰ。");
});

test("spokenFix：羅馬數字、地鐵括號、趴、千分位", () => {
  assert.equal(spokenFix("螞蟻洞Ⅲ 地鐵二號線[地區02] 70% 2,100"), "螞蟻洞三 地鐵二號線 地區2  70趴 2100");
});

test("刺菇菇（11/25 正式站，出沒地圖有「組隊訓練場<獎金地點>」）：要傳上 YouTube 的標題、說明合規", () => {
  const s = mobScript(parseMob(fx("mob-2110200.txt")), { link: "https://maplehelper.tw/db/monsters/2110200?utm_campaign=mob-2110200" });
  assert.match(s.description, /組隊訓練場<獎金地點>/); // 頁面原文真的有角括號
  const yt = parseYoutubeTxt(youtubeText({ ytTitle: capTitle(s.ytTitle), description: buildDescription(s.description, s.link) }));
  assert.deepEqual(youtubeProblems(yt), []);
  assert.match(yt.description, /組隊訓練場＜獎金地點＞ 24 個/);
  assert.match(yt.description, /utm_campaign=mob-2110200/); // 認做過的題目靠這個
});
