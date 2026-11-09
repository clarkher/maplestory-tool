import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPatch } from "./patch-diff.mjs";

const mk = (over = {}) => ({ items: [], quests: [], monsters: [], maps: {}, ...over });
const item = (id, o = {}) => ({ id, n: `道具${id}`, c: "其他", s: "雜物", ...o });

test("新 id 進 added.items；外觀/角色只加 looks", () => {
  const d = diffPatch(mk(), mk({ items: [item(1, { eq: { reqLevel: 30 } }), item(2, { c: "時裝", s: "外觀/角色" })] }));
  assert.deepEqual(d.added.items, [{ id: 1, n: "道具1", c: "其他", s: "雜物", lv: 30 }]);
  assert.equal(d.counts.items, 1);
  assert.equal(d.counts.looks, 1);
});

test("舊有新沒有 → gone；任務同理", () => {
  const d = diffPatch(
    mk({ items: [item(1)], quests: [{ id: "9", n: "舊任務", cat: "A" }] }),
    mk(),
  );
  assert.deepEqual(d.gone.items, [{ id: 1, n: "道具1" }]);
  assert.deepEqual(d.gone.quests, [{ id: "9", n: "舊任務" }]);
  assert.equal(d.counts.goneItems, 1);
  assert.equal(d.counts.goneQuests, 1);
});

test("只有 qr、qq、un、c、sh 變 → 不進 changed", () => {
  const a = item(1, { qr: [1], qq: [2], un: 1, sh: 5 });
  const b = item(1, { qr: [3], qq: [4], un: 0, sh: 6, c: "消耗" });
  const d = diffPatch(mk({ items: [a] }), mk({ items: [b] }));
  assert.deepEqual(d.changed, []);
  assert.equal(d.counts.changed, 0);
});

test("d 變 → 說明，before/after 是全文", () => {
  const d = diffPatch(
    mk({ items: [item(1, { d: "每種各 1500 。" })] }),
    mk({ items: [item(1, { d: "每種各 1200 。" })] }),
  );
  assert.deepEqual(d.changed, [{ id: 1, n: "道具1", kind: "說明", before: "每種各 1500 。", after: "每種各 1200 。" }]);
});

test("d 和 sp 都變 → 兩列，counts.changed 為 1", () => {
  const d = diffPatch(
    mk({ items: [item(1, { d: "a" })] }),
    mk({ items: [item(1, { d: "b", sp: [{ p: "商城", pr: 100, c: 1 }] })] }),
  );
  assert.equal(d.changed.length, 2);
  assert.equal(d.counts.changed, 1);
});

test("sp 可讀字串：沒賣 → 商城 100；多家用、接", () => {
  const d = diffPatch(
    mk({ items: [item(1), item(2, { sp: [{ p: "冰原雪域武器店", n: "盧米", m: 1, pr: 100000 }] })] }),
    mk({
      items: [
        item(1, { sp: [{ p: "商城", pr: 100, c: 1 }] }),
        item(2, { sp: [{ p: "冰原雪域武器店", n: "盧米", m: 1, pr: 100000 }, { p: "商城", pr: 100, c: 1 }] }),
      ],
    }),
  );
  const r = Object.fromEntries(d.changed.map(c => [c.id, c]));
  assert.equal(r[1].kind, "商店");
  assert.equal(r[1].before, "沒賣");
  assert.equal(r[1].after, "商城 100");
  assert.equal(r[2].before, "冰原雪域武器店 100,000");
  assert.equal(r[2].after, "冰原雪域武器店 100,000、商城 100");
});

test("dm → 怪名用、接，查不到寫怪 id", () => {
  const d = diffPatch(
    mk({ items: [item(1, { dm: [10] })], monsters: [{ id: 10, n: "木妖", lv: 4 }] }),
    mk({ items: [item(1, { dm: [10, 11, 12] })], monsters: [{ id: 10, n: "木妖", lv: 4 }, { id: 11, n: "藍蝸牛", lv: 2 }] }),
  );
  assert.equal(d.changed[0].kind, "掉落");
  assert.equal(d.changed[0].before, "木妖");
  assert.equal(d.changed[0].after, "木妖、藍蝸牛、12");
});

test("eq → 站上欄位名，只列有變的欄位", () => {
  const d = diffPatch(
    mk({ items: [item(1, { eq: { reqLevel: 50, incPAD: 40, attackSpeed: 6 } })] }),
    mk({ items: [item(1, { eq: { reqLevel: 50, incPAD: 48, attackSpeed: 6, incSTR: 3 } })] }),
  );
  assert.equal(d.changed[0].kind, "能力");
  assert.equal(d.changed[0].before, "攻擊力 40、力量 無");
  assert.equal(d.changed[0].after, "攻擊力 48、力量 3");
});

test("eq 的職業與攻速用可讀字", () => {
  const d = diffPatch(
    mk({ items: [item(1, { eq: { reqJob: 1, attackSpeed: 6 } })] }),
    mk({ items: [item(1, { eq: { reqJob: 9, attackSpeed: 5 } })] }),
  );
  assert.equal(d.changed[0].before, "需求職業 劍士、攻擊速度 普通（6）");
  assert.equal(d.changed[0].after, "需求職業 劍士、盜賊、攻擊速度 快（5）");
});

test("名稱變 → 名稱", () => {
  const d = diffPatch(mk({ items: [item(1, { n: "舊" })] }), mk({ items: [item(1, { n: "新" })] }));
  assert.deepEqual(d.changed, [{ id: 1, n: "新", kind: "名稱", before: "舊", after: "新" }]);
});

test("任務、怪物、地圖新增；maps 以 key 當 id", () => {
  const d = diffPatch(
    mk({ quests: [{ id: "1", n: "舊", cat: "X" }], monsters: [{ id: 1, n: "a", lv: 1 }], maps: { 5: { zh: "舊圖", st: "S" } } }),
    mk({
      quests: [{ id: "1", n: "舊", cat: "X" }, { id: "2", n: "新任務", cat: "冰原雪域", minLv: 40 }],
      monsters: [{ id: 1, n: "a", lv: 1 }, { id: 2, n: "b", lv: 9 }],
      maps: { 5: { zh: "舊圖", st: "S" }, 6: { zh: "新圖", st: "冰原雪域" } },
    }),
  );
  assert.deepEqual(d.added.quests, [{ id: "2", n: "新任務", cat: "冰原雪域", minLv: 40, area: "冰原雪域" }]);
  assert.deepEqual(d.added.monsters, [{ id: 2, n: "b", lv: 9 }]);
  assert.deepEqual(d.added.maps, [{ id: "6", zh: "新圖", st: "冰原雪域" }]);
  assert.deepEqual([d.counts.quests, d.counts.monsters, d.counts.maps], [1, 1, 1]);
});

test("sp 只換順序 → 不算商店變動", () => {
  const a = { p: "冰原雪域武器店", pr: 100000 };
  const b = { p: "商城", pr: 100, c: 1 };
  const d = diffPatch(mk({ items: [item(1, { sp: [a, b] })] }), mk({ items: [item(1, { sp: [b, a] })] }));
  assert.deepEqual(d.changed, []);
});

test("sp 活動貨幣寫貨幣名、整組賣寫件數，不像楓幣價；分流圖同一句只列一次", () => {
  const d = diffPatch(
    mk({ items: [item(1)] }),
    mk({
      items: [
        item(1, {
          sp: [
            { p: "雪原的面具祭典現場", n: "行商人", m: 1, pr: 10, u: "萬聖節硬幣", e: "2026-11-11T23:59+08:00" },
            { p: "雪原的面具祭典現場", n: "行商人", m: 2, pr: 1, k: 10, u: "萬聖節硬幣" },
            { p: "雪原的面具祭典現場", n: "行商人", m: 3, pr: 1, k: 10, u: "萬聖節硬幣" },
            { p: "楓之谷通行證遠端商店", pr: 1400, k: 2000 },
            { p: "商城", pr: 100, c: 1 },
          ],
        }),
      ],
    }),
  );
  assert.equal(
    d.changed[0].after,
    "商城 100、楓之谷通行證遠端商店 2,000 個 1,400、雪原的面具祭典現場 10 個 1 萬聖節硬幣、雪原的面具祭典現場 10 萬聖節硬幣",
  );
});
