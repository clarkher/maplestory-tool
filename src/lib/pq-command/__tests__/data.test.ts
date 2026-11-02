import { describe, expect, it } from "vitest";
import { PQS } from "../data";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}️]/u;

describe("組隊指揮內容", () => {
  it("三個任務：月妙 4 關、超綠 5 關、女神 8 關；女神標舊版", () => {
    expect(PQS.map((p) => [p.key, p.stages.length])).toEqual([["moon", 4], ["kerning", 5], ["goddess", 8]]);
    expect(PQS.find((p) => p.key === "goddess")?.old).toBe(true);
    expect(PQS.filter((p) => p.old).map((p) => p.key)).toEqual(["goddess"]);
  });

  it("每關至少一條隊長要做、一句喊話；關代號不重複", () => {
    for (const pq of PQS) {
      expect(new Set(pq.stages.map((s) => s.key)).size).toBe(pq.stages.length);
      for (const st of pq.stages) {
        expect(st.todo.length, `${pq.key}/${st.key}`).toBeGreaterThan(0);
        expect(st.lines.length, `${pq.key}/${st.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("喊話不超過 40 字（遊戲聊天一行打得完）、全部文字沒有 emoji", () => {
    for (const pq of PQS) {
      for (const st of pq.stages) {
        for (const line of st.lines) expect(line.length, line).toBeLessThanOrEqual(40);
        for (const text of [st.title, st.goal, ...st.todo, ...st.lines]) expect(EMOJI.test(text), text).toBe(false);
      }
    }
  });

  it("試組合的關：超綠繩 4 挑 3、平台 5 挑 3、桶 6 挑 3、女神拉桿 5 挑 2", () => {
    const specs = PQS.flatMap((p) => p.stages.filter((s) => s.combo).map((s) => [`${p.key}/${s.key}`, s.combo!.kind, s.combo!.n, s.combo!.k]));
    expect(specs).toEqual([
      ["kerning/rope", "stand", 4, 3],
      ["kerning/platform", "stand", 5, 3],
      ["kerning/barrel", "stand", 6, 3],
      ["goddess/upper", "pull", 5, 2],
    ]);
  });
});
