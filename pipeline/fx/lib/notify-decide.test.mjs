import test from "node:test";
import assert from "node:assert/strict";
import { decide } from "./notify-decide.mjs";

const base = { write: "true", collectResult: "success", publishResult: "success", ageHours: "1.5" };

test("抓到了、推上去了、資料不舊：關掉開著的 issue", () => {
  assert.equal(decide(base).action, "close");
  assert.equal(decide({ ...base, ageHours: "11.9" }).action, "close");
});

test("參考站抓不到或格式變了（collect 紅）：開 issue", () => {
  const result = decide({ ...base, collectResult: "failure", publishResult: "skipped", ageHours: "" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /參考站/);
});

test("推不上 fx-data：開 issue", () => {
  const result = decide({ ...base, publishResult: "failure" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /fx-data/);
});

test("參考站 12 小時以上沒更新（可能停了）：開 issue", () => {
  const result = decide({ ...base, ageHours: "12" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /12 小時/);
});

test("不寫入的測試跑法、被取消的：什麼都不做", () => {
  assert.equal(decide({ ...base, write: "false", collectResult: "failure" }).action, "none");
  assert.equal(decide({ ...base, collectResult: "cancelled", publishResult: "skipped" }).action, "none");
});
