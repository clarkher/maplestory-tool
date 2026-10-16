import assert from "node:assert/strict";
import { test } from "node:test";
import { officialNoteStatus, officialSkillNote, OFFICIAL_SKILL_NOTES } from "./official-skill-notes.mjs";

// 脫離戰場 5201006 的說明照抄上游 2.0.0（2026-10-15）：遊戲說明還寫 3 秒，官方平衡公告改成 1.5 秒
const ESCAPE_DESC = "利用火槍的後座力，發射子彈攻擊敵人並向後方移動，再次使用等待時間：3秒。";

test("脫離戰場：遊戲說明還寫 3 秒時，卡片多一行官方公告的 1.5 秒，附官方出處", () => {
  const note = officialSkillNote(5201006, ESCAPE_DESC);
  assert.match(note.t, /1\.5 秒/);
  assert.match(note.t, /3 秒/);
  assert.match(note.s, /^https:\/\/maplestoryclassic-event\.beanfun\.com\/.*eventAdId=20210$/);
});

test("遊戲說明哪天改成 1.5 秒了，這行就不出現（不跟遊戲自己的字重複）", () => {
  assert.equal(officialSkillNote(5201006, ESCAPE_DESC.replace("3秒", "1.5秒")), undefined);
});

test("officialNoteStatus：說明還是舊的→note、改成新數字→fixed、兩個都對不上（上游換了字）→lost，verify 擋 lost", () => {
  assert.equal(officialNoteStatus(5201006, ESCAPE_DESC), "note");
  assert.equal(officialNoteStatus(5201006, ESCAPE_DESC.replace("3秒", "1.5秒")), "fixed");
  assert.equal(officialNoteStatus(5201006, "利用火槍的後座力，發射子彈攻擊敵人並向後方移動，冷卻時間：３秒。"), "lost");
  assert.equal(officialNoteStatus(5201006, undefined), "lost");
});

test("表裡沒有的技能沒有這行；表裡每一筆都有官方出處", () => {
  assert.equal(officialSkillNote(3201005, "發射的箭會穿透敵人"), undefined);
  for (const entry of Object.values(OFFICIAL_SKILL_NOTES)) assert.match(entry.source, /^https:\/\/maplestoryclassic/);
});
