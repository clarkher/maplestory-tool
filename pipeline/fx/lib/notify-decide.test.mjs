import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "./notify-decide.mjs";

const base = { write: "true", collectResult: "success", publishResult: "success", ok8591: "true", fail8591: "0" };

test("8591 正常、推上去了：關掉開著的 issue", () => {
  assert.equal(decide(base).action, "close");
});

test("兩個來源都失敗（collect 紅）：開 issue", () => {
  const result = decide({ ...base, collectResult: "failure", publishResult: "skipped", ok8591: "", fail8591: "" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /兩個來源都失敗/);
});

test("推不上 fx-data：開 issue", () => {
  assert.match(decide({ ...base, publishResult: "failure" }).reason, /fx-data/);
});

test("8591 失敗但有參考站：連續 3 次才開，之前不吵", () => {
  assert.equal(decide({ ...base, ok8591: "false", fail8591: "2" }).action, "none");
  const result = decide({ ...base, ok8591: "false", fail8591: "3" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /連續 3 次/);
});

test("不寫入的測試跑法（別的分支手動觸發沒勾 write）：什麼都不做", () => {
  assert.equal(decide({ ...base, write: "false", collectResult: "failure" }).action, "none");
});
