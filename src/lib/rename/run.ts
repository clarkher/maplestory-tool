/**
 * 名字變怪物：比對請求的處理（Worker 跟主執行緒退路共用）。
 *   { type: "match", segs }                    segs＝已 splitAtCorners → normalize 的段（64 格）；回 pickResult 的結果
 *   { type: "replay", segs, id, kept, score }  分享連結重播：照連結裡的怪／保留段重建結果，擺法（xf）用 fitShape 重算
 *   { type: "shape", id }                      只要名字跟輪廓（連結解不開時畫靜態結果卡用）
 * 回：{ result, pts, n }；pts＝那隻怪（或它的換色本尊）的輪廓點，給演出貼筆畫用；找不到就 null。
 */
import { fitShape, pickResult, type Result, type Shape } from "./match";
import type { Pt, Stroke } from "./strokes";

export type MatchIn =
  | { type: "match"; segs: Stroke[] }
  | { type: "replay"; segs: Stroke[]; id: number | "poop"; kept: number[]; score: number }
  | { type: "shape"; id: number };

export type MatchOut = { result: Result | null; pts: Pt[] | null; n: string | null };

let shapesP: Promise<Shape[]> | null = null;
/** shapes.json 第一次用到才載 */
export function loadShapes(): Promise<Shape[]> {
  shapesP ??= import("./shapes.json").then(m => {
    const data = ((m as { default?: unknown }).default ?? m) as { shapes: Shape[] };
    return data.shapes;
  });
  return shapesP;
}

/** 怪物 id 可能是換色的那隻（alt），輪廓用本尊的 */
export function findShape(shapes: Shape[], id: number): { shape: Shape; n: string } | null {
  for (const s of shapes) {
    if (s.id === id) return { shape: s, n: s.n };
    const alt = s.alt?.find(a => a.id === id);
    if (alt) return { shape: s, n: alt.n };
  }
  return null;
}

export function runMatch(msg: MatchIn, shapes: Shape[], rand: () => number): MatchOut {
  if (msg.type === "match") {
    const result = pickResult(msg.segs, shapes, rand);
    const hit = result.kind === "monster" ? findShape(shapes, result.id) : null;
    return { result, pts: hit?.shape.pts ?? null, n: hit?.n ?? null };
  }
  if (msg.type === "shape") {
    const hit = findShape(shapes, msg.id);
    return { result: null, pts: hit?.shape.pts ?? null, n: hit?.n ?? null };
  }
  // 重播；連結裡的怪這版沒有了就當一坨演，不亂配別隻
  const hit = msg.id === "poop" ? null : findShape(shapes, msg.id);
  if (!hit || msg.id === "poop") return { result: { kind: "poop", score: msg.score }, pts: null, n: null };
  const kept = msg.kept.filter(i => i >= 0 && i < msg.segs.length);
  // 擺法跟當初一樣用全部段算（拉伸擺法看的是整片筆跡的外框）；保留哪幾段照連結
  const fit = fitShape(msg.segs, hit.shape);
  return { result: { kind: "monster", id: msg.id, n: hit.n, kept, score: msg.score, xf: fit.xf }, pts: hit.shape.pts, n: hit.n };
}
