import assert from "node:assert/strict";
import { test } from "node:test";
import { compactElemental } from "./elemental.mjs";

// 上游 artale.json 怪物的 elemental 原樣（2026-09-24 版，白狼人 8140000）
const WHITE_FANG = {
  raw: "I2F3",
  source: "mob",
  values: { fire: "weak", ice: "resist", lightning: "normal", poison: "normal", holy: "normal" },
  summary: "火弱點、冰抗性",
};

test("上游寫 resist 的存成 r（白狼人：火弱點、冰抗性 → f:w、i:r），跟前端、職業規則認的代碼一樣", () => {
  assert.deepEqual(compactElemental(WHITE_FANG), { f: "w", i: "r" });
});

test("免疫存成 i；strong（管線原本對照表的寫法）跟 resist 同義，一樣存成 r", () => {
  assert.deepEqual(
    compactElemental({ values: { fire: "normal", ice: "immune", lightning: "strong", poison: "normal", holy: "normal" } }),
    { i: "i", l: "r" },
  );
});

test("全部一般、或沒有屬性資料的怪不存 el", () => {
  assert.equal(compactElemental({ values: { fire: "normal", ice: "normal", lightning: "normal", poison: "normal", holy: "normal" } }), undefined);
  assert.equal(compactElemental(undefined), undefined);
  assert.equal(compactElemental({ raw: "" }), undefined);
});

test("上游出現認不得的抗性寫法就讓重建失敗，不再取首字母存成玩家看不懂的代碼；訊息寫出是哪隻怪", () => {
  assert.throws(
    () => compactElemental({ values: { fire: "absorb", ice: "normal" } }, "8140000 白狼人"),
    error => error.message.includes("8140000 白狼人") && error.message.includes("fire: absorb"),
  );
});

test("剛好跟物件內建屬性同名的寫法（constructor、toString）也算認不得", () => {
  assert.throws(() => compactElemental({ values: { fire: "constructor" } }), /constructor/);
  assert.throws(() => compactElemental({ values: { toString: "weak" } }), /toString/);
});

test("上游多了認不得的屬性：有抗性或弱點就讓重建失敗，全是一般就不影響", () => {
  assert.throws(() => compactElemental({ values: { fire: "normal", physical: "weak" } }), /physical/);
  assert.deepEqual(compactElemental({ values: { fire: "weak", physical: "normal" } }), { f: "w" });
});

// 客戶端原始代碼（elemental.raw）裡有 4 隻混沌系怪帶暗屬性（例：混沌魔精靈 H2D3），
// 上游整理過的 values 目前沒給；哪天補進來，重建不該因此停下來
test("上游的暗屬性（dark）存成 d", () => {
  assert.deepEqual(compactElemental({ values: { fire: "normal", holy: "resist", dark: "weak" } }), { h: "r", d: "w" });
});
