import test from "node:test";
import assert from "node:assert/strict";
import { MANUAL_MAX, MANUAL_MIN, githubOutputLines, parseManual } from "./manual.mjs";

test("沒填（空字串、只有空白、undefined、null）＝不是手動補一筆，回 null", () => {
  for (const empty of ["", "   ", "\n", undefined, null]) assert.equal(parseManual(empty), null, JSON.stringify(empty));
});

test("填數字：整數、小數、前後空白都收，回數字", () => {
  assert.equal(parseManual("300"), 300);
  assert.equal(parseManual(" 312.5 "), 312.5);
  assert.equal(parseManual("10"), MANUAL_MIN);
  assert.equal(parseManual("2000"), MANUAL_MAX);
  assert.equal(parseManual(250), 250);
});

test("不是 10～2000 的數字就丟錯，訊息是中文、帶著收到的字", () => {
  for (const bad of ["abc", "300萬", "-5", "0", "9.99", "2000.1", "5000", "1e3", "0x20", "NaN", "Infinity", "3 00", "300,5", Number.NaN, Number.POSITIVE_INFINITY, 5000]) {
    assert.throws(() => parseManual(bad), error => /手動補一筆/.test(error.message) && /10～2000/.test(error.message) && error.message.includes(JSON.stringify(String(bad))), String(bad));
  }
});

test("錯誤訊息把收到的字用 JSON 字串印（換行、控制字元會被跳脫，不能在 Actions log 裡多出一行指令）", () => {
  const evil = "1\n::error::x";
  assert.throws(() => parseManual(evil), error => !/[\r\n]/.test(error.message) && error.message.includes(JSON.stringify(evil)));
});

test("githubOutputLines：ageHours 一定寫，manualAdded 寫 true 或 false（平常的輪沒有這欄也寫 false）", () => {
  assert.equal(githubOutputLines({ ageHours: 1.5 }), "ageHours=1.5\nmanualAdded=false\n");
  assert.equal(githubOutputLines({ ageHours: 0, manualAdded: true }), "ageHours=0\nmanualAdded=true\n");
  assert.equal(githubOutputLines({ ageHours: 0, manualAdded: false }), "ageHours=0\nmanualAdded=false\n");
});
