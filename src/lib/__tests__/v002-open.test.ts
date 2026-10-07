import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { beforeV002 } from "@/lib/release";
import {
  BANNER_MARK,
  checkArgs,
  decideOpenTime,
  decideRedeploy,
  hasBanner,
  parseMaintenance,
  parseOpenAt,
  pickNotices,
  setOpenTime,
} from "../../../scripts/v002-open.mjs";

// .github/workflows/v002-open.yml 的判斷（scripts/v002-open.mjs）：開機後重新部署、照官方維護公告開 PR 改開機時刻
const ROOT = path.resolve(import.meta.dirname, "../../..");
const releaseSource = fs.readFileSync(path.join(ROOT, "src/lib/release.ts"), "utf8");
const OPEN = Date.parse("2026-10-15T14:00:00+08:00");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("parseOpenAt：排程從 main 的 release.ts 讀開機時刻，跟網站自己的判斷一模一樣", () => {
  it("讀現在的 release.ts：算出來的時刻就是網站標示收掉的那一刻", () => {
    const open = parseOpenAt(releaseSource);
    expect(open).not.toBeNull();
    expect(beforeV002(open!.at - 1)).toBe(true);
    expect(beforeV002(open!.at)).toBe(false);
  });

  it("舊版 release.ts（只有開放日、沒有開機時刻）：照舊版程式當天 00:00 收", () => {
    expect(parseOpenAt('export const V002_OPEN_DATE = "2026-10-15";')?.at).toBe(Date.parse("2026-10-15T00:00:00+08:00"));
  });

  it("release.ts 被拆掉、或讀不到開放日：回 null（排程當作已經完成，不動作）", () => {
    expect(parseOpenAt(null)).toBeNull();
    expect(parseOpenAt("export const LEVEL_CAP = 120;")).toBeNull();
  });

  it("開機時刻那一行在、但寫壞了（25:30、9:00、日期不存在）：讀成看不懂（NaN），不能默默當 00:00", () => {
    const date = 'export const V002_OPEN_DATE = "2026-10-15";\n';
    expect(parseOpenAt(`${date}export const V002_OPEN_TIME = "25:30";`)?.at).toBeNaN();
    expect(parseOpenAt(`${date}export const V002_OPEN_TIME = "9:00";`)?.at).toBeNaN();
    expect(parseOpenAt(`${date}const V002_OPEN_TIME = "14:00";`)?.at).toBeNaN();
    expect(parseOpenAt('export const V002_OPEN_DATE = "2026-13-45";')?.at).toBeNaN();
  });
});

describe("hasBanner：首頁 HTML 裡還有沒有開機前建置的 V002 橫幅", () => {
  it("有橫幅那段字：開機前建置的靜態頁", () => {
    const html =
      '<p class="rounded-xl bg-[color:var(--gold-wash)] px-3 py-2">已經照 10/15 改版排好：三轉、Lv.120、天空之城／冰原雪域／廢礦區，要 2026/10/15 開機後才能去。</p>';
    expect(hasBanner(html)).toBe(true);
  });

  it("沒有：開機後建置的靜態頁", () => {
    expect(hasBanner('<header class="px-1 pt-2 text-center"><h1>楓谷幫手</h1></header>')).toBe(false);
  });

  it("排程認的字還在首頁橫幅的原始碼裡（改了橫幅文案，這裡會紅：記得一起改 scripts/v002-open.mjs 的 BANNER_MARK）", () => {
    const routeHome = fs.readFileSync(path.join(ROOT, "src/components/route/RouteHome.tsx"), "utf8");
    expect(routeHome).toContain(BANNER_MARK);
  });
});

describe("decideRedeploy：開機後要不要推一個不改檔案的 commit，讓 Vercel 重建靜態頁", () => {
  const base = { openAt: OPEN, banner: true, pushes: [] as number[] };

  it("還沒到開機＋5 分鐘：等", () => {
    expect(decideRedeploy({ ...base, now: OPEN + 4 * MINUTE }).action).toBe("wait");
  });

  it("開機 5 分鐘後首頁還有橫幅、還沒推過：推", () => {
    expect(decideRedeploy({ ...base, now: OPEN + 5 * MINUTE }).action).toBe("deploy");
  });

  it("首頁已經沒有橫幅（重建好了，或開機後本來就有別的部署）：完成", () => {
    expect(decideRedeploy({ ...base, banner: false, now: OPEN + 20 * MINUTE }).action).toBe("done");
  });

  it("release.ts 已經沒有開機時刻（標示拆掉了）：完成，不動作", () => {
    expect(decideRedeploy({ ...base, openAt: null, now: OPEN + 20 * MINUTE }).action).toBe("done");
  });

  it("讀不到首頁（網路錯誤）：等下一輪再看，不亂推", () => {
    expect(decideRedeploy({ ...base, banner: null, now: OPEN + 20 * MINUTE }).action).toBe("wait");
  });

  it("一直讀不到首頁、開機 2 小時了：開 issue 叫人", () => {
    expect(decideRedeploy({ ...base, banner: null, now: OPEN + 2 * HOUR }).action).toBe("alert");
  });

  it("開機時刻看不懂（release.ts 寫壞）：不管現在幾點都不推，開 issue 叫人", () => {
    for (const now of [Date.parse("2026-10-07T14:00:00+08:00"), OPEN + 10 * MINUTE]) {
      expect(decideRedeploy({ ...base, openAt: Number.NaN, now }).action).toBe("alert");
    }
  });

  it("10 分鐘內剛推過：等 Vercel 重建，不重複推", () => {
    expect(decideRedeploy({ ...base, pushes: [OPEN + 6 * MINUTE], now: OPEN + 15 * MINUTE }).action).toBe("wait");
  });

  it("推過還有橫幅、上一次超過 10 分鐘：再推一次（自己修）", () => {
    expect(decideRedeploy({ ...base, pushes: [OPEN + 6 * MINUTE, OPEN + 21 * MINUTE], now: OPEN + 36 * MINUTE }).action).toBe("deploy");
  });

  it("推了 3 次還有橫幅：不再推，開 issue 叫人", () => {
    const pushes = [OPEN + 6 * MINUTE, OPEN + 21 * MINUTE, OPEN + 36 * MINUTE];
    expect(decideRedeploy({ ...base, pushes, now: OPEN + 51 * MINUTE }).action).toBe("alert");
  });

  it("開機 2 小時了還有橫幅：開 issue 叫人", () => {
    expect(decideRedeploy({ ...base, pushes: [OPEN + 90 * MINUTE], now: OPEN + 2 * HOUR }).action).toBe("alert");
  });

  it("開機超過一天（包括明年的 10/15）：不再處理", () => {
    expect(decideRedeploy({ ...base, now: OPEN + 25 * HOUR }).action).toBe("expired");
    expect(decideRedeploy({ ...base, now: Date.parse("2027-10-15T14:30:00+08:00") }).action).toBe("expired");
  });
});

describe("parseMaintenance：從官方維護公告讀 10/15 幾點到幾點", () => {
  it("例行維護關機公告的寫法（2026-09-30 那則）", () => {
    const text = "親愛的冒險者們： 全伺服器將於 10/1(四) 08:00 ~ 14:00 ， 進行例行維護關機作業 。";
    expect(parseMaintenance(text, "2026-10-01")).toMatchObject({ start: "08:00", end: "14:00" });
    // excerpt 是公告原文那一段連前後文，PR 說明會附上讓人對照
    const excerpt = parseMaintenance(text, "2026-10-01")?.excerpt;
    expect(excerpt).toContain("全伺服器將於 10/1(四) 08:00 ~ 14:00");
    expect(excerpt).toContain("進行例行維護");
  });

  it("寫了年份、沒有空格、結束時間不是整點", () => {
    expect(parseMaintenance("全伺服器將於2026/10/15(四)08:00~16:30進行改版維護", "2026-10-15")).toMatchObject({ start: "08:00", end: "16:30" });
  });

  it("全形括號、全形波浪號、上午／下午", () => {
    expect(parseMaintenance("維護時間：10/15（四）上午 8:00 ～ 下午 6:00", "2026-10-15")).toMatchObject({ start: "08:00", end: "18:00" });
  });

  it("維護時間調整公告（原定→調整後）：取最後一個（調整後）", () => {
    const text = "原維護日期、時間 2026/10/15(四) 08:00~14:00 調整後維護日期、時間 2026/10/15(四) 08:00~17:00";
    expect(parseMaintenance(text, "2026-10-15")).toMatchObject({ start: "08:00", end: "17:00" });
  });

  it("別天的維護：不算", () => {
    expect(parseMaintenance("全伺服器將於 10/1(四) 08:00 ~ 14:00", "2026-10-15")).toBeNull();
    expect(parseMaintenance("全伺服器將於 10/15(四) 08:00 ~ 14:00", "2026-10-01")).toBeNull();
  });

  it("延後開機公告（沒寫幾點開）：讀不到時間，不處理", () => {
    expect(parseMaintenance("今日10/15(四) 例行維護作業原定下午14:00開機， 但維護時間超乎預期，開機時間另行公告。", "2026-10-15")).toBeNull();
  });

  it("同一則還寫了跨到別天的販售期間：只認維護那段，不會讀成 23:59", () => {
    const text = "全伺服器將於 10/15(四) 08:00 ~ 14:00 進行例行維護。商品販售時間 2026/10/15(四)14:00~2026/11/11(三) 23:59";
    expect(parseMaintenance(text, "2026-10-15")).toMatchObject({ start: "08:00", end: "14:00" });
  });

  it("前後都沒有「維護」的時段（活動、商城）：不算", () => {
    expect(parseMaintenance("活動時間：10/15(四) 14:00 ~ 23:59 登入就送好禮", "2026-10-15")).toBeNull();
  });

  it("結束不晚於開始：不算", () => {
    expect(parseMaintenance("全伺服器將於 10/15(四) 14:00 ~ 08:00 進行維護", "2026-10-15")).toBeNull();
  });

  it("同一天、網站開機時刻之後才開始的時段（維護補償領取、首日加碼）：不算維護時間", () => {
    const text = "全伺服器將於 10/15(四) 08:00 ~ 18:00 進行維護。維護補償領取：10/15(四) 20:00 ~ 23:59";
    expect(parseMaintenance(text, "2026-10-15", "14:00")).toMatchObject({ start: "08:00", end: "18:00" });
    expect(parseMaintenance("維護後開放新地圖！首日加碼：10/15(四) 16:00 ~ 20:00", "2026-10-15", "14:00")).toBeNull();
  });

  it("改版公告寫「改版關機作業」「停機更新」、沒有「維護」兩個字：也認得", () => {
    const v002 = "全伺服器將於 10/15(四) 08:00 ~ 18:00 ，進行《V002覺醒的力量》改版關機作業";
    expect(parseMaintenance(v002, "2026-10-15", "14:00")).toMatchObject({ start: "08:00", end: "18:00" });
    expect(parseMaintenance("10/15(四) 08:00 ~ 17:30 進行停機更新", "2026-10-15", "14:00")).toMatchObject({ end: "17:30" });
  });
});

describe("pickNotices：哪些公告要打開來讀 10/15 的維護時間", () => {
  const rows = [
    { bullentinId: "1", startDate: "2026/10/14", title: "新楓之谷：經典版《1014(三)V002覺醒的力量 例行維護關機公告》" },
    { bullentinId: "2", startDate: "2026/10/15", title: "新楓之谷：經典版《1015(四)全伺服器臨時維護公告》" },
    { bullentinId: "3", startDate: "2026/10/15", title: "新楓之谷：經典版 《1015(四)延後開機公告》" },
    { bullentinId: "4", startDate: "2026/10/15", title: "新楓之谷：經典版 《1015(四)V002 例行維護開機公告》" },
    { bullentinId: "5", startDate: "2026/10/13", title: "新楓之谷：經典版《1013(二)維護時間調整公告》" },
    { bullentinId: "6", startDate: "2026/10/12", title: "新楓之谷：經典版《1012(一) 全伺服器分段分流維護公告》" },
    { bullentinId: "7", startDate: "2026/10/01", title: "新楓之谷：經典版《0930(三)初心啟航例行維護關機公告》" },
    { bullentinId: "8", startDate: "2026/10/14", title: "新楓之谷：經典版《1014(三)V002覺醒的力量 改版維護公告》" },
  ];

  it("只看關機公告、維護時間調整、改版維護；臨時維護、延後開機、開機公告、分流維護不看；一週前發的不看", () => {
    expect(pickNotices(rows, "2026-10-15").map((row: { bullentinId: string }) => row.bullentinId)).toEqual(["1", "5", "8"]);
  });
});

describe("decideOpenTime：公告的開機時間跟網站設定不同，要不要開 PR 改", () => {
  const now = Date.parse("2026-10-14T16:00:00+08:00");

  it("還沒有公告：不動作", () => {
    expect(decideOpenTime({ now, date: "2026-10-15", current: "14:00", announced: null }).action).toBe("none");
  });

  it("公告跟網站一樣：不動作", () => {
    expect(decideOpenTime({ now, date: "2026-10-15", current: "14:00", announced: "14:00" }).action).toBe("none");
  });

  it("公告維護到 18:00、網站設 14:00：開 PR 改成 18:00", () => {
    expect(decideOpenTime({ now, date: "2026-10-15", current: "14:00", announced: "18:00" })).toMatchObject({ action: "pr", time: "18:00" });
  });

  it("公告的開機時間已經過了：改了也沒用，不動作", () => {
    const late = Date.parse("2026-10-15T12:30:00+08:00");
    expect(decideOpenTime({ now: late, date: "2026-10-15", current: "14:00", announced: "12:00" }).action).toBe("none");
  });

  it("已經過了網站設定的開機時刻：不再看公告（當天延後不處理）", () => {
    const after = Date.parse("2026-10-15T14:30:00+08:00");
    expect(decideOpenTime({ now: after, date: "2026-10-15", current: "14:00", announced: "18:00" }).action).toBe("none");
  });

  it("公告讀到的時間不合理（99:00）：不開 PR", () => {
    expect(decideOpenTime({ now, date: "2026-10-15", current: "14:00", announced: "99:00" }).action).toBe("none");
  });

  it("網站設定的開機時刻讀不懂：不開 PR", () => {
    expect(decideOpenTime({ now, date: "2026-10-15", current: "", announced: "18:00" }).action).toBe("none");
  });
});

describe("checkArgs：假時間絕不推正式機", () => {
  const drillTime = "2026-10-15T14:06:00+08:00";

  it("假時間又不是只看不做：只能打測試機", () => {
    expect(() => checkArgs({ dryRun: false, pretend: drillTime, only: "all", token: "x" })).toThrow();
    expect(() => checkArgs({ dryRun: false, pretend: drillTime, only: "main", token: "x" })).toThrow();
    const drill = checkArgs({ dryRun: false, pretend: drillTime, only: "dev", token: "x" });
    expect(drill.now).toBe(Date.parse(drillTime));
    expect([drill.canWrite("main"), drill.canWrite("dev"), drill.watchWrite]).toEqual([false, true, false]);
  });

  it("只看不做：哪一站都只看，不用 token", () => {
    const look = checkArgs({ dryRun: true, pretend: drillTime, only: "all", token: "" });
    expect([look.canWrite("main"), look.canWrite("dev"), look.watchWrite]).toEqual([false, false, false]);
  });

  it("排程正常跑：正式機、測試機、公告都能寫", () => {
    const real = checkArgs({ dryRun: false, pretend: "", only: "all", token: "x" });
    expect([real.canWrite("main"), real.canWrite("dev"), real.watchWrite]).toEqual([true, true, true]);
  });

  it("時間看不懂、站名不對、要真的做卻沒有 token：直接報錯", () => {
    expect(() => checkArgs({ dryRun: true, pretend: "明天", only: "all", token: "" })).toThrow();
    expect(() => checkArgs({ dryRun: true, pretend: "", only: "prod", token: "" })).toThrow();
    expect(() => checkArgs({ dryRun: false, pretend: "", only: "all", token: "" })).toThrow();
  });
});

describe("setOpenTime：PR 只改 release.ts 的開機時刻那一行", () => {
  it("改成 18:00：排程讀得到新時刻，其他行一字不動", () => {
    const next = setOpenTime(releaseSource, "18:00");
    expect(parseOpenAt(next)?.at).toBe(Date.parse("2026-10-15T18:00:00+08:00"));
    // Windows 的工作目錄是 CRLF（排程從 GitHub 讀到的是 LF），兩種都要對
    const before = releaseSource.split(/\r?\n/);
    const after = next.split(/\r?\n/);
    expect(after.length).toBe(before.length);
    expect(after.filter((line: string, index: number) => line !== before[index])).toEqual(['export const V002_OPEN_TIME = "18:00";']);
  });

  it("找不到那一行（檔案被改過）：直接報錯，不亂改", () => {
    expect(() => setOpenTime("export const LEVEL_CAP = 120;", "18:00")).toThrow();
  });
});
