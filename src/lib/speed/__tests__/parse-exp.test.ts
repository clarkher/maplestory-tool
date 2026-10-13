import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findStatusBar } from "../status-bar";
import { levelFor, parseExp, readExpText, type ExpReading } from "../read-exp";
import { loadFixture } from "./fixture";

const toNext: number[] = JSON.parse(fs.readFileSync("public/data/guides/common.json", "utf8")).expTable.toNext;

describe("經驗＋% 反推等級", () => {
  it("406947、79.73% 只對得上 46 等（升級要 510,420）", () => {
    expect(toNext[46]).toBe(510420);
    expect(levelFor(406947, 79.73, toNext, [])).toBe(46);
  });

  it("% 認錯一點（79.78）還在誤差內；認錯很多（70.73）對不上", () => {
    expect(levelFor(406947, 79.78, toNext, [])).toBe(46);
    expect(levelFor(406947, 70.73, toNext, [])).toBeNull();
  });

  it("% 很小時好幾級都對得上：沒有提示就不認，提示只剩一級對得上才認", () => {
    const exp = Math.round(toNext[30] * 0.0002);
    expect(levelFor(exp, 0.02, toNext, [])).toBeNull();
    expect(levelFor(exp, 0.02, toNext, [30])).toBe(30);
  });

  it("提示裡有兩級都對得上（剛升級、經驗很小）：分不出來就回 null，不挑較低的", () => {
    const exp = Math.round(toNext[30] * 0.0002);
    expect(levelFor(exp, 0.02, toNext, [30, 31])).toBeNull();
    expect(levelFor(exp, 0.02, toNext, [31, 30])).toBeNull();
    expect(levelFor(exp, 0.02, toNext, [30, 90])).toBeNull();
  });

  it("有提示時只認提示裡的等級（避免拆錯位數剛好對到別的等級）", () => {
    expect(levelFor(406947, 79.73, toNext, [47, 48])).toBeNull();
  });
});

describe("parseExp", () => {
  it("有括號照括號切", () => {
    expect(parseExp("%P 406947[7973%]", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("括號沒認出來：試著把最後 4 或 3 位當 %，用經驗表挑對的", () => {
    expect(parseExp("649 4069477973%", toNext)).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("認錯的回 null", () => {
    expect(parseExp("648 406947[7073%", toNext)).toBeNull();
    expect(parseExp("", toNext)).toBeNull();
  });

  it("截圖放大 1、1.25、1.5、2 倍：不是讀對就是 null，絕不讀錯，而且至少有一個尺寸讀得到", async () => {
    const readings = [];
    for (const scale of [1, 1.25, 1.5, 2]) {
      const frame = await loadFixture("window-1364.png", scale);
      const reading = parseExp(readExpText(frame, findStatusBar(frame)!), toNext);
      if (reading) expect(reading, `scale ${scale}`).toMatchObject({ exp: 406947, level: 46 });
      readings.push(reading);
    }
    expect(readings.filter(reading => reading !== null).length).toBeGreaterThan(0);
  });

  it("原尺寸要讀得到（使用者實際的視窗）", async () => {
    const frame = await loadFixture("window-1364.png");
    expect(parseExp(readExpText(frame, findStatusBar(frame)!), toNext)).toMatchObject({ exp: 406947, level: 46 });
  });

  it("有括號就只照括號切：括號切不出來不准改用最後幾位硬湊（會湊出另一個自洽的錯答案）", () => {
    // 去掉前導零再切 4 位會變成 exp 69477、9.73% -> 對上 50 等
    expect(parseExp("006947[7973%]", toNext)).toBeNull();
    // 括號裡百分位只剩 498：切 4 位會變成 exp 25441、4.98% -> 對上 46 等
    expect(parseExp("254410[498%]", toNext, [46, 47])).toBeNull();
    // 括號內百分位錯成 1973：有提示（46、47）擋得住；沒提示時括號本身就自洽地對上 70 等（254410[498%] 同理對上 87 等），
    // 這是沒提示時擋不掉的（見下面性質測試量到的殘餘錯誤率），所以呼叫端一定要帶提示。
    expect(parseExp("406947[1973%]", toNext, [46, 47])).toBeNull();
  });

  it("經驗不會有前導零：有就整個丟掉", () => {
    expect(parseExp("0406947[7973%]", toNext)).toBeNull();
    expect(parseExp("04069477973%", toNext)).toBeNull();
    expect(parseExp("0[000%]", toNext, [46])).toMatchObject({ exp: 0, percent: 0, level: 46 });
  });

  it("有提示：只認提示裡的等級", () => {
    expect(parseExp("649 4069477973%", toNext, [46, 47])).toEqual({ exp: 406947, percent: 79.73, level: 46 });
    expect(parseExp("%P 406947[7973%]", toNext, [46, 47])).toEqual({ exp: 406947, percent: 79.73, level: 46 });
  });

  it("有提示但畫面對的是別級：回 null，不硬配", () => {
    expect(parseExp("%P 406947[7973%]", toNext, [47, 48])).toBeNull();
    expect(parseExp("649 4069477973%", toNext, [10, 11])).toBeNull();
  });
});

/** 固定種子的亂數（不用 Math.random，測試每次跑都一樣） */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 真實畫面的字：經驗[百分比去掉小數點%]，例如 406947[7973%] */
function screenText(exp: number, level: number): string {
  return `${exp}[${((exp / toNext[level]) * 100).toFixed(2).replace(".", "")}%]`;
}

/** 把字串裡的每一個數字各換成另外 9 個數字（一次只換一個） */
function* singleDigitSubstitutions(text: string): Generator<string> {
  for (let i = 0; i < text.length; i++) {
    if (!/\d/.test(text[i])) continue;
    for (const digit of "0123456789") if (digit !== text[i]) yield text.slice(0, i) + digit + text.slice(i + 1);
  }
}

describe("認錯一個數字：不是 null 就是對的（性質測試）", () => {
  const random = mulberry32(20261013);
  const cases = Array.from({ length: 200 }, () => {
    const level = 8 + Math.floor(random() * 70); // 8 ~ 77
    const exp = Math.floor(random() * toNext[level]);
    return { level, exp, text: screenText(exp, level) };
  });

  /** 把每個案例的每一種單一數字認錯都丟進 parseExp，回傳讀出來卻不對的（等級不對，或經驗差超過 % 容許的 0.0007 倍升級經驗） */
  function wrongReadings(hintsFor: (level: number) => number[]) {
    const wrong: Array<{ text: string; bad: string; trueLevel: number; reading: ExpReading }> = [];
    let total = 0;
    for (const { level, exp, text } of cases) {
      for (const bad of singleDigitSubstitutions(text)) {
        total++;
        const reading = parseExp(bad, toNext, hintsFor(level));
        if (reading && (reading.level !== level || Math.abs(reading.exp - exp) > 0.0007 * toNext[level])) {
          wrong.push({ text, bad, trueLevel: level, reading });
        }
      }
    }
    return { total, wrong };
  }

  it("真字串讀得回來：提示只有真等級時一定讀得到；多帶一級時讀到的一定是對的", () => {
    for (const { level, exp, text } of cases) {
      expect(parseExp(text, toNext, [level]), text).toMatchObject({ level, exp });
      const reading = parseExp(text, toNext, [level, level + 1]);
      // 剛升級、經驗很小時 L 跟 L+1 都對得上，分不出來回 null 是對的
      if (reading) expect(reading, text).toMatchObject({ level, exp });
    }
    expect(cases.filter(c => parseExp(c.text, toNext, [c.level, c.level + 1]) !== null).length).toBeGreaterThan(150);
  });

  it("提示只有真等級 [L]：任何單一數字認錯，不是 null 就是對的（0 個錯）", () => {
    const { total, wrong } = wrongReadings(level => [level]);
    expect(total).toBeGreaterThan(15000);
    expect(wrong).toEqual([]);
  });

  it("提示 [L, L+1]：讀錯的只會是「對上 L+1」，不會對上別級；比例上限 0.5%（實測 68 / 16479 = 0.41%）", () => {
    // 這個殘餘無法在不放寬 PERCENT_TOLERANCE 的前提下消掉：一個數字認錯後，剛好跟 L+1 的經驗表自洽
    // （例如 818[173%] -> 918[173%] 在 26 等是合法讀數）。呼叫端平常只帶 [L]，升級時要連兩張一致才認。
    const { total, wrong } = wrongReadings(level => [level, level + 1]);
    expect(total).toBeGreaterThan(15000);
    expect(wrong.filter(w => w.reading.level !== w.trueLevel + 1)).toEqual([]);
    expect(wrong.length).toBeLessThanOrEqual(Math.floor(total * 0.005));
  });

  it("沒有提示（括號切得出來）：讀錯的比例上限 3%（實測 454 / 16479 = 2.76%），這就是呼叫端一定要帶提示的原因", () => {
    const { total, wrong } = wrongReadings(() => []);
    expect(total).toBeGreaterThan(15000);
    expect(wrong.length).toBeLessThanOrEqual(Math.floor(total * 0.03));
  });
});
