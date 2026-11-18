// 傷害計算機的楓葉武器（v2.37，11/18 拍板 A）：選單有楓葉商會的武器；全幸、全智預設左組楓葉（衝完 +12）、右組雨傘／狼牙
import { describe, expect, it } from "vitest";
import { defaultState, regroup, relevel, weaponChoices, withLeafWeapons, type CalcData } from "../damage-view";
import { gearPlan } from "../gear-view";
import { staticCalcData } from "../static-data";

const base = staticCalcData();
const data: CalcData = withLeafWeapons(base);
const name = (id: number | null) => data.gear.weapons.find(weapon => weapon.id === id)?.n;

describe("withLeafWeapons", () => {
  it("19 把楓葉武器併進選單，刺客選得到楓葉拳套", () => {
    expect(data.gear.weapons.length - base.gear.weapons.length).toBe(19);
    expect(weaponChoices(data.gear, 410).map(weapon => weapon.n)).toContain("楓葉拳套");
  });

  it("首頁那套挑主推不看活動武器：一般點法刺客 50 等的主推跟沒併之前一樣", () => {
    expect(gearPlan(data.gear, 410, 50, "一般點法").best?.id).toBe(gearPlan(base.gear, 410, 50, "一般點法").best?.id);
  });

  it("沒併過（攻略文、推薦卡）預設照舊", () => {
    expect(defaultState(base, 210, 50, "全智").groups[1].tab).toBe("裝備法");
  });
});

describe("全智：左楓葉法杖（魔攻 58+12、智力 +6）、右雨傘", () => {
  const state = defaultState(data, 210, 50, null);
  const plain = defaultState(base, 210, 50, null);
  it("左組", () => {
    const [left] = state.groups;
    expect(left.tab).toBe("全智");
    expect(name(left.weaponId)).toBe("楓葉法杖");
    expect(left.weaponAtk).toBe(70);
    expect(left.stats.INT).toBe(plain.groups[0].stats.INT + 6);
  });
  it("右組同一套點法、黃色雨傘、乾淨能力值", () => {
    const right = state.groups[1];
    expect(right.tab).toBe("全智");
    expect(name(right.weaponId)).toBe("黃色雨傘");
    expect(right.weaponAtk).toBeNull();
    expect(right.stats).toEqual(plain.groups[0].stats);
  });
  it("35～39 等：楓葉之杖對藍色雨傘", () => {
    const low = defaultState(data, 210, 36, null);
    expect(low.groups.map(group => name(group.weaponId))).toEqual(["楓葉之杖", "藍色雨傘"]);
  });
  it("楓葉還不到等級（30 等）照原本：右組裝備法", () => {
    expect(defaultState(data, 210, 30, null).groups[1].tab).toBe("裝備法");
  });
});

describe("全幸：左楓葉拳套、右狼牙", () => {
  it("刺客 50 等", () => {
    const state = defaultState(data, 410, 50, "全幸");
    expect(state.groups.map(group => name(group.weaponId))).toEqual(["楓葉拳套", "狼牙"]);
    expect(state.groups[0].weaponAtk).toBe(23 + 12);
    expect(state.groups[1].tab).toBe("全幸");
  });
  it("俠盜拿不了拳套：左楓葉短刀、右照原本主推", () => {
    const state = defaultState(data, 420, 50, "全幸");
    expect(name(state.groups[0].weaponId)).toBe("楓葉短刀");
    expect(state.groups[1].weaponId).toBe(defaultState(base, 420, 50, "全幸").groups[0].weaponId);
  });
  it("一般點法不換", () => {
    expect(defaultState(data, 410, 50, "一般點法").groups).toEqual(defaultState(base, 410, 50, "一般點法").groups);
  });
});

describe("換等級、換點法", () => {
  it("沒動過的全智 40→43：楓葉之杖換楓葉法杖、雨傘照等級換", () => {
    const next = relevel(data, defaultState(data, 210, 40, null), 43);
    expect(next.groups.map(group => name(group.weaponId))).toEqual(["楓葉法杖", "黃色雨傘"]);
    expect(next.groups[0].weaponAtk).toBe(70);
  });
  it("右組從一般點法換成全幸：拿狼牙", () => {
    const state = defaultState(data, 410, 50, "一般點法");
    expect(name(regroup(data, 410, state.groups[1], { tab: "全幸" }, 1).weaponId)).toBe("狼牙");
    expect(name(regroup(data, 410, state.groups[0], { tab: "全幸" }, 0).weaponId)).toBe("楓葉拳套");
  });
});
