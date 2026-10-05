import { describe, expect, it } from "vitest";
import { availableSp, buildProgress, isFreeStep, mainBuild, spAtLevel, stepText, stepsBetween } from "@/lib/skill-plan";
import type { GuideBuild } from "@/lib/types";

describe("可用技能點", () => {
  it("一轉：轉職拿 1 點，之後每級 3 點", () => {
    expect(availableSp(100, 9)).toBe(0);
    expect(availableSp(100, 10)).toBe(1);
    expect(availableSp(100, 30)).toBe(61);
    expect(availableSp(200, 30)).toBe(67);
  });

  it("二轉：30 等拿 1 點，之後每級 3 點；未滿 30 回一轉點數", () => {
    expect(availableSp(110, 30)).toBe(1);
    expect(availableSp(110, 35)).toBe(16);
    expect(availableSp(110, 25)).toBe(46);
  });
});

const build: GuideBuild = {
  label: "測試",
  main: true,
  v: "tw",
  s: [],
  steps: [
    { id: 1, name: "甲", to: 5 },
    { id: 2, name: "乙", to: 3 },
    { id: 1, name: "甲", to: 10 },
    { id: 3, name: "丙", to: 4 },
  ],
};

describe("點法走到哪一步", () => {
  it("同一技能出現兩次只算差額", () => {
    const progress = buildProgress(build, 0);
    expect(progress.steps.map(step => step.cost)).toEqual([5, 3, 5, 4]);
    expect(progress.total).toBe(17);
  });

  it("點數用在哪一步，那一步就是現在", () => {
    const progress = buildProgress(build, 9);
    expect(progress.steps.map(step => step.state)).toEqual(["done", "done", "now", "next"]);
    expect(progress.current?.name).toBe("甲");
    expect(progress.current?.reached).toBe(6);
  });

  it("剛好點完一步：最新的點數用在那一步，它還是現在，下一步才是下一個", () => {
    const progress = buildProgress(build, 8);
    expect(progress.steps.map(step => step.state)).toEqual(["done", "now", "next", "later"]);
    expect(progress.current?.name).toBe("乙");
    expect(progress.current?.reached).toBe(3);
  });

  it("海盜 Lv.10 只有 1 點：點雙子星攻擊 1，再來衝擊拳 20（不是叫你點衝擊拳）", () => {
    const pirate: GuideBuild = {
      label: "打手線",
      main: true,
      v: "tw",
      s: [],
      steps: [
        { id: 5001003, name: "雙子星攻擊", to: 1 },
        { id: 5001001, name: "衝擊拳", to: 20 },
        { id: 5001002, name: "旋風斬", to: 1 },
        { id: 5000000, name: "極限迴避", to: 20 },
      ],
    };
    const progress = buildProgress(pirate, 1);
    expect(progress.current).toMatchObject({ name: "雙子星攻擊", to: 1, reached: 1 });
    expect(progress.steps.find(step => step.state === "next")).toMatchObject({ name: "衝擊拳", to: 20 });
  });

  it("點數剛好等於整條點法：最後一步還是現在，多一點才算點完", () => {
    expect(buildProgress(build, 17)).toMatchObject({ finished: false, current: { name: "丙", reached: 4 } });
    expect(buildProgress(build, 18).finished).toBe(true);
  });

  it("還沒有點數時第一步是現在", () => {
    const progress = buildProgress(build, 0);
    expect(progress.steps.map(step => step.state)).toEqual(["now", "next", "later", "later"]);
  });

  it("點數超過全部步驟就是點完了", () => {
    const progress = buildProgress(build, 30);
    expect(progress.finished).toBe(true);
    expect(progress.current).toBeUndefined();
    expect(progress.steps.every(step => step.state === "done")).toBe(true);
  });
});

describe("點法一步的寫法", () => {
  it("沒有指定技能的步驟寫「自由分配 N 點」，不露「自由配點（未指定）」", () => {
    expect(stepText({ id: null, name: "自由配點（未指定）", to: 1, cost: 1 })).toBe("自由分配 1 點");
    expect(stepText({ id: 5001001, name: "衝擊拳", to: 20, cost: 19 })).toBe("衝擊拳 20");
    expect(isFreeStep({ id: null, name: "自由配點（未指定）" })).toBe(true);
    expect(isFreeStep({ id: null, name: "某個不在站內的技能" })).toBe(false);
  });
});

describe("每一轉自己的點數", () => {
  it("轉職前是 0，轉職當下 1 點", () => {
    expect(spAtLevel(110, 29)).toBe(0);
    expect(spAtLevel(110, 30)).toBe(1);
    expect(spAtLevel(100, 9)).toBe(0);
    expect(spAtLevel(200, 8)).toBe(1);
  });

  it("轉職那一段要包含只花 1 點的第一步", () => {
    const build: GuideBuild = {
      label: "測試",
      main: true,
      v: "tw",
      s: [],
      steps: [{ id: 1, name: "瞬間移動", to: 1 }, { id: 2, name: "聖光", to: 30 }],
    };
    const steps = stepsBetween(build, spAtLevel(230, 29), spAtLevel(230, 39));
    expect(steps.map(step => step.name)).toEqual(["瞬間移動", "聖光"]);
  });
});

describe("主流點法", () => {
  const builds: GuideBuild[] = [
    { label: "打手線（實測）", main: true, v: "tw", s: [], steps: [] },
    { label: "槍手線（實測）", main: true, v: "tw", s: [], steps: [] },
    { label: "舊版", main: false, v: "legacy", s: [], steps: [] },
  ];

  it("有好幾條主流時，挑名稱提到你二轉職業的那條", () => {
    expect(mainBuild(builds, "槍手")?.label).toBe("槍手線（實測）");
    expect(mainBuild(builds, "打手")?.label).toBe("打手線（實測）");
  });

  it("沒指定或都沒提到時用第一條主流", () => {
    expect(mainBuild(builds)?.label).toBe("打手線（實測）");
    expect(mainBuild(builds, "狂戰士")?.label).toBe("打手線（實測）");
  });
});
