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

test("fx-data 12 小時以上沒有新的市價（參考站停了，或格式、口徑改了）：開 issue", () => {
  const result = decide({ ...base, ageHours: "12" });
  assert.equal(result.action, "open");
  assert.match(result.reason, /12 小時/);
  assert.match(result.reason, /fx-data/);
  assert.match(result.reason, /格式、口徑改了/);
});

test("不寫入的測試跑法：什麼都不做（就算 collect 失敗或被取消）", () => {
  assert.equal(decide({ ...base, write: "false", collectResult: "failure" }).action, "none");
  assert.equal(decide({ ...base, write: "false", collectResult: "cancelled", publishResult: "skipped" }).action, "none");
});

test("collect 或 publish 超過 timeout-minutes 被中止（cancelled）：開 issue，不能靜靜過去", () => {
  const collect = decide({ ...base, collectResult: "cancelled", publishResult: "skipped", ageHours: "" });
  assert.equal(collect.action, "open");
  assert.match(collect.reason, /時間上限/);
  const publish = decide({ ...base, publishResult: "cancelled" });
  assert.equal(publish.action, "open");
  assert.match(publish.reason, /時間上限/);
});

test("ageHours 讀不到：不動 issue（不要誤關）", () => {
  assert.equal(decide({ ...base, ageHours: "" }).action, "none");
  assert.equal(decide({ ...base, ageHours: "NaN" }).action, "none");
  // 但 collect 失敗時即使 ageHours 空的也要開 issue
  assert.equal(decide({ ...base, collectResult: "failure", publishResult: "skipped", ageHours: "" }).action, "open");
});

test("這輪是手動補的（manualAdded=true）、collect 跟 publish 都成功：不動 issue（參考站還沒恢復，不能因為 ageHours 剛歸零就關）", () => {
  const result = decide({ ...base, ageHours: "0", manualAdded: "true" });
  assert.deepEqual(result, { action: "none", reason: "這輪是手動補的，參考站還沒恢復前不關 issue" });
});

test("manualAdded 不是 true（false、空、沒給）照平常判斷", () => {
  for (const manualAdded of ["false", "", undefined]) assert.equal(decide({ ...base, manualAdded }).action, "close", String(manualAdded));
});

test("手動補的那一輪如果 collect 或 publish 失敗、被取消、或不寫入：照平常的規則（失敗還是要開 issue）", () => {
  assert.equal(decide({ ...base, manualAdded: "true", publishResult: "failure" }).action, "open");
  assert.equal(decide({ ...base, manualAdded: "true", collectResult: "failure", publishResult: "skipped", ageHours: "" }).action, "open");
  assert.equal(decide({ ...base, manualAdded: "true", publishResult: "cancelled" }).action, "open");
  assert.equal(decide({ ...base, manualAdded: "true", write: "false" }).reason, "測試跑法（沒有寫入），不通知");
});
