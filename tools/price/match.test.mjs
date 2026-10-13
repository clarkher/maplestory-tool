import test from "node:test";
import assert from "node:assert/strict";
import { squash, lcs, nameScore, bestNameScore } from "./match.mjs";

test("squash 去掉 Windows 辨識塞在中文字之間的空白", () => {
  assert.equal(squash("手 套 攻 擊 卷 軸 10 %"), "手套攻擊卷軸10%");
});

test("lcs 是最長共同子序列長度", () => {
  assert.equal(lcs("手套攻擊卷軸", "手套攻鑿卷軸"), 5);
  assert.equal(lcs("", "abc"), 0);
});

test("錯一個字（攻擊→攻鑿）還是同一件", () => {
  assert.ok(nameScore("手套攻擊卷軸10%", "手 套 攻 鑿 卷 軸 10 % 1 , 320 , 000") >= 0.7);
});

test("10% 跟 60% 是不同東西：數字一定要一樣", () => {
  assert.equal(nameScore("手套攻擊卷軸10%", "手套攻擊卷軸60% 2,000,000"), 0);
});

test("日之鏢 跟 雷之鏢 不能混", () => {
  assert.equal(nameScore("雷之鏢", "日之鏢 350,000"), 0);
  assert.ok(nameScore("雷之鏢", "雷 之 鏢 350,000") > 0);
});

test("bestNameScore 取最像的那行；空的回 0", () => {
  assert.ok(bestNameScore("黃色雨傘", ["市價", "黃 色 雨 傘 魔法攻擊力+48"]) > 0);
  assert.equal(bestNameScore("黃色雨傘", []), 0);
  assert.equal(nameScore("", "abc"), 0);
});

test("敏捷卷軸跟攻擊卷軸要分開：中文字不一樣", () => {
  assert.equal(nameScore("手套攻擊卷軸10%", "手套敏捷卷軸10% 500,000"), 0);
});

test("防禦卷軸跟攻擊卷軸要分開：中文字不一樣", () => {
  assert.equal(nameScore("手套攻擊卷軸10%", "手套防禦力卷軸10% 500,000"), 0);
});

test("10% 跟 100% 一定要一樣", () => {
  assert.equal(nameScore("手套攻擊卷軸10%", "手套攻擊卷軸100% 500,000"), 0);
});
