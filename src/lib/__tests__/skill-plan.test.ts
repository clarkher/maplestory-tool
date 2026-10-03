import { describe, expect, it } from "vitest";
import { availableSp, buildProgress, mainBuild, spAtLevel, stepsBetween } from "@/lib/skill-plan";
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

  it("剛好點完一步，下一步是現在", () => {
    const progress = buildProgress(build, 8);
    expect(progress.steps.map(step => step.state)).toEqual(["done", "done", "now", "next"]);
    expect(progress.current?.reached).toBe(5);
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
