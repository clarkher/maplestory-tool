/**
 * 像度校正：用「真的筆畫」寫出來的 10 個 ID（__fixtures__/hand.json，scripts/rename/build-hand-fixtures.mjs 產的，
 * 筆畫來自 makemeahanzi 的中線資料＋自訂的手寫英數字母）跑完整流程 splitAtCorners → normalize → pickResult，
 * 看結果分布：同一隻怪（換色算同一組）最多 3 次、一坨 1～2 組。
 * 沒過就只調 match.ts 的 displayScore 係數（要維持單調）。
 *
 * 大一點的校正報告（不進版控）：
 *   node scripts/rename/build-hand-fixtures.mjs <graphics.txt> --calib <calib.json>
 *   RENAME_CALIB=<calib.json> npx vitest run src/lib/rename/__tests__/calibrate.test.ts
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickResult, type Result, type Shape } from "../match";
import { normalize, splitAtCorners, type Stroke } from "../strokes";
import { seeded } from "../synth";
import shapesJson from "../shapes.json";
import hand from "../__fixtures__/hand.json";

const shapes = (shapesJson as unknown as { shapes: Shape[] }).shapes;
type HandSet = { seed: number; ids: { id: string; strokes: Stroke[] }[] };

/** 換色怪算同一組：回代表輪廓的名字 */
const groupOf = (id: number) => shapes.find(s => s.id === id || s.alt?.some(a => a.id === id))!.n;

function run(set: HandSet) {
  const rand = seeded(2026);
  return set.ids.map(({ id, strokes }) => {
    const segs = normalize(splitAtCorners(strokes)).filter(s => s.length > 0);
    const r: Result = pickResult(segs, shapes, rand);
    return { id, segs: segs.length, r };
  });
}

function summarize(rows: ReturnType<typeof run>) {
  const wins = new Map<string, number>();
  let poop = 0;
  for (const { r } of rows) {
    if (r.kind === "poop") poop++;
    else if (r.kind === "monster") wins.set(groupOf(r.id), (wins.get(groupOf(r.id)) ?? 0) + 1);
  }
  const top = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  return { poop, wins, top };
}

const line = ({ id, segs, r }: ReturnType<typeof run>[number]) =>
  `${id}\t${segs} 段\t${r.kind === "monster" ? `${r.n}（${r.id}）` : r.kind}\t${"score" in r ? r.score : "-"}`;

describe("手寫樣本校正", () => {
  it("10 組：同一隻怪 ≤ 3 次、一坨 1～2 組", () => {
    const rows = run(hand as unknown as HandSet);
    console.log(`[calibrate]\n${rows.map(line).join("\n")}`);
    expect(rows).toHaveLength(10);
    const { poop, top } = summarize(rows);
    expect(rows.every(x => x.r.kind !== "empty")).toBe(true);
    expect(top[0]?.[1] ?? 0).toBeLessThanOrEqual(3);
    expect(poop).toBeGreaterThanOrEqual(1);
    expect(poop).toBeLessThanOrEqual(2);
  }, 60_000);

  it.runIf(process.env.RENAME_CALIB)("大樣本報告（RENAME_CALIB 指到 --calib 產的檔）", () => {
    const set = JSON.parse(readFileSync(process.env.RENAME_CALIB!, "utf8")) as HandSet;
    const rows = run(set);
    const { poop, wins, top } = summarize(rows);
    const scores = rows.map(x => ("score" in x.r ? x.r.score : 0)).sort((a, b) => a - b);
    console.log(
      `[calibrate ${rows.length}]\n${rows.map(line).join("\n")}\n` +
        `一坨 ${poop}/${rows.length}（${((poop / rows.length) * 100).toFixed(1)}%）、贏過的怪 ${wins.size} 組、` +
        `最多那組 ${top[0]?.[0]} ${top[0]?.[1]} 次（${(((top[0]?.[1] ?? 0) / rows.length) * 100).toFixed(1)}%）、前 5：${JSON.stringify(top.slice(0, 5))}\n` +
        `像度 最低 ${scores[0]}、中位 ${scores[Math.floor(scores.length / 2)]}、最高 ${scores[scores.length - 1]}`,
    );
  }, 300_000);
});
