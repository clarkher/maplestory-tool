import test from "node:test";
import assert from "node:assert/strict";
import { parseSimScroll, buildScrollSim } from "./scroll-sim.mjs";

const NO_EQ = new Map();
const scroll = (n, d, id = 2040001) => ({ id, n, d, c: "消耗", s: "卷軸" });

test("短劍攻擊詛咒卷軸30%：部位、成功率、爆裝率、屬性", () => {
  const r = parseSimScroll(
    { id: 2043305, n: "短劍攻擊詛咒卷軸30%", d: "短劍附加攻擊力提升屬性。 成功率：30%，物理攻擊力+5，LUK+3，物理防禦力+1 失敗時有50%機率道具被破壞" },
    NO_EQ,
  );
  assert.equal(r.slot, "短刀");
  assert.equal(r.rate, 30);
  assert.equal(r.boom, 0.5);
  assert.deepEqual(r.stats, [{ k: "物理攻擊力", v: 5 }, { k: "幸運", v: 3 }, { k: "物理防禦力", v: 1 }]);
  assert.equal(r.n, "短劍攻擊詛咒卷軸30%");
});

test("爆裝六種寫法", () => {
  const cases = [
    ["失敗時有50%機率道具被破壞", 0.5],
    ["若失敗時以80%機率物品會破壞。", 0.8],
    ["若失敗時道具會以50%的機率消失。", 0.5],
    ["失敗時，道具以10%機率毀損。", 0.1],
    ["若失敗有50%機率會破壞道具", 0.5],
    ["#c失敗時道具毀損。", 1],
  ];
  for (const [tail, boom] of cases) {
    const r = parseSimScroll(scroll("手套攻擊詛咒卷軸30%", `手套附加攻擊。 成功率：30%，物理攻擊力+3 ${tail}`), NO_EQ);
    assert.equal(r?.boom, boom, tail);
  }
  assert.equal(parseSimScroll(scroll("手套攻擊卷軸60%", "手套附加攻擊。 成功率：60%，物理攻擊力+2"), NO_EQ).boom, 0);
});

test("寫會爆但抓不到數字也不是「#c失敗時道具毀損」→ 不收", () => {
  assert.equal(parseSimScroll(scroll("手套攻擊卷軸30%", "成功率：30%，物理攻擊力+3 失敗時道具會被破壞"), NO_EQ), null);
});

test("部位對照", () => {
  const slotOf = n => parseSimScroll(scroll(n, `成功率：60%，MaxHP+10`), NO_EQ)?.slot;
  assert.equal(slotOf("頭盔防禦卷軸60%"), "帽子");
  assert.equal(slotOf("頭盔生命卷軸60%"), "帽子");
  assert.equal(slotOf("全身盔甲力量卷軸65%"), "套服");
  assert.equal(slotOf("褲、裙防禦卷軸60%"), "褲裙");
  assert.equal(slotOf("褲/裙防禦卷軸60%"), "褲裙");
  assert.equal(slotOf("褲子敏捷卷軸60%"), "褲裙");
  assert.equal(slotOf("戒子力量卷軸60%"), "戒指");
  assert.equal(slotOf("腰帶力量卷軸60%"), "腰帶");
  assert.equal(slotOf("火槍攻擊卷軸60%"), "火槍");
});

test("不收的卷", () => {
  const no = (n, d = "成功率：60%，物理攻擊力+3") => assert.equal(parseSimScroll(scroll(n, d), NO_EQ), null, n);
  no("驚訝的混沌卷軸60%");
  no("寵物速度卷軸60%");
  no("單手武器攻擊力卷軸60%");
  no("飾品力量卷軸60%");
  no("裝飾品力量卷軸60%");
  no("一級防具力量卷軸40%");
  no("詛咒的防具增幅卷軸20%");
  no("頭盔防禦卷軸", "沒有寫成功率，物理防禦力+3");
});

test("專用卷：用「可使用的裝備」對 id", () => {
  const eqByName = new Map([["楓葉之杖", [1372000]], ["楓葉法杖", [1382000]]]);
  const item = scroll("法師的楓葉武器魔力卷軸 70%", "為法師的楓葉武器增加魔力。 成功率：70%，魔法攻擊力+2，INT+1 可使用的裝備：楓葉之杖、楓葉法杖");
  const r = parseSimScroll(item, eqByName);
  assert.equal(r.slot, null);
  assert.deepEqual(r.only, [1372000, 1382000]);
  assert.equal(r.rate, 70);
  assert.deepEqual(r.stats, [{ k: "魔法攻擊力", v: 2 }, { k: "智力", v: 1 }]);
  // 沒有「的」的寫法
  const r2 = parseSimScroll(scroll("法師的楓葉武器魔力卷軸 70%", "成功率：70%，魔法攻擊力+2 可使用裝備：楓葉之杖"), eqByName);
  assert.deepEqual(r2.only, [1372000]);
  // 名字都對不到
  assert.equal(parseSimScroll(scroll("法師的楓葉武器魔力卷軸 70%", "成功率：70%，魔法攻擊力+2 可使用的裝備：不存在之杖"), eqByName), null);
});

const emptyCtx = { monstersById: new Map(), questsById: new Map(), maps: {}, openMap: () => null, v002Date: undefined };

test("buildScrollSim：白衣獨立、同名同成功率併 ids、沒來源仍收", () => {
  const items = [
    scroll("白衣卷軸10%", "卷軸套用失敗減少的可升級次數恢復1。商城道具無法使用。 成功率：10%", 2049004),
    scroll("白衣卷軸20%", "卷軸套用失敗減少的可升級次數恢復1。商城道具無法使用。 成功率：20%", 2049005),
    scroll("頭盔防禦卷軸60%", "頭盔附加防禦。 成功率：60%，物理防禦力+2", 2040001),
    scroll("頭盔防禦卷軸60%", "頭盔附加防禦。 成功率：60%，物理防禦力+2", 2040002),
    { id: 1002001, n: "金屬頭箍", c: "裝備", s: "帽子", eq: { reqLevel: 15, tuc: 7 }, sp: [{ p: "店", pr: 3000, m: 1 }] },
    { id: 1002002, n: "寵物裝", c: "裝備", s: "寵物裝備", eq: { tuc: 3 } },
    { id: 1002003, n: "無洞", c: "裝備", s: "帽子", eq: { reqLevel: 5, tuc: 0 } },
  ];
  const out = buildScrollSim(items, emptyCtx);
  assert.deepEqual(out.white.map(w => [w.id, w.rate]), [[2049004, 10], [2049005, 20]]);
  assert.equal(out.scrolls.length, 1);
  assert.deepEqual(out.scrolls[0].ids, [2040001, 2040002]);
  assert.equal(out.scrolls[0].id, 2040001);
  assert.equal(out.scrolls[0].src, false);
  assert.equal(out.scrolls[0].slot, "帽子");
  assert.deepEqual(out.equips, [{ id: 1002001, n: "金屬頭箍", s: "帽子", tuc: 7, lv: 15, src: true }]);
});

test("buildScrollSim：對不到任何裝備部位的卷不收", () => {
  const items = [scroll("頭盔防禦卷軸60%", "成功率：60%，物理防禦力+2")];
  assert.equal(buildScrollSim(items, emptyCtx).scrolls.length, 0);
});

test("屬性名：「使用成功力量+3」去掉前綴", () => {
  const r = parseSimScroll(scroll("戒子力量卷軸10%", "戒子附加力量。 成功率：10%，使用成功力量+3"), NO_EQ);
  assert.deepEqual(r.stats, [{ k: "力量", v: 3 }]);
});
