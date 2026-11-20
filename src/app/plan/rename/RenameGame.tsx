"use client";

/**
 * 名字變怪物：整個流程用 NPC 對話框演（像真的接任務）。
 *   intro：NPC 問要不要登錄冒險者名冊［停止對話］［拒絕］［接受］，拒絕＝鬼打牆換句話繼續問
 *   sign：對話框下面出現登記書（SignPad）
 *   running：切段＋正規化後丟 Worker 比對，回來就播演出（stage.ts：寫字→收筆畫→變形→標題）；
 *            變形播完（標題開始）才切 result，NPC 說結果
 *   result：演出停在最後一格＋［分享（shareSlot，Task 7 填）］［再寫一次］＋「{怪}在哪打／怎麼去 →」
 * 狀態轉換在 src/lib/rename/flow.ts（純函式、有測試）。
 *
 * replay（Task 7 的 /plan/rename/m/[id]）：一開場就從 location.hash 的 #r=... 解出筆畫重播；
 * 解不開就畫那隻怪的靜態結果卡＋［換我寫］。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { monsterImage } from "@/lib/asset-paths";
import { initialCtx, next, RESULT_PAGE2_LINES, RUNNING_LINES, type Action, type Ctx, type Step } from "@/lib/rename/flow";
import { introLines, resultLines } from "@/lib/rename/lines";
import type { Result } from "@/lib/rename/match";
import { loadShapes, runMatch, type MatchIn, type MatchOut } from "@/lib/rename/run";
import { drawStage, TIMELINE } from "@/lib/rename/stage";
import { decodeShare, normalize, splitAtCorners, type Pt, type Stroke } from "@/lib/rename/strokes";
import { NpcDialog, type DlgButton } from "./NpcDialog";
import { BTN_PLAIN, SignPad } from "./SignPad";

/** 標題開始的時間點：這時 NPC 改說結果 */
const REVEAL_MS = TIMELINE.write + TIMELINE.collect + TIMELINE.morph;
const TOTAL_MS = REVEAL_MS + TIMELINE.title;

type Play = { segs: Stroke[]; result: Result; shape: { pts: Pt[] } | undefined };
type Replay = { id: number | "poop" };

/** 比對：先用 Worker；Worker 起不來或出錯就在主執行緒算（慢一點但不會卡死在 running） */
function useMatcher() {
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  return useCallback(async (msg: MatchIn): Promise<MatchOut> => {
    try {
      worker.current ??= new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module" });
      const w = worker.current;
      return await new Promise<MatchOut>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<MatchOut | { error: true }>) =>
          "error" in e.data ? reject(new Error("worker")) : resolve(e.data);
        w.onerror = () => reject(new Error("worker"));
        w.postMessage(msg);
      });
    } catch {
      worker.current?.terminate();
      worker.current = null;
      return runMatch(msg, await loadShapes(), Math.random);
    }
  }, []);
}

/** 演出畫布（4:5）：play 換了就從 0 開始播，播到 TOTAL_MS 停在最後一格；到 REVEAL_MS 呼叫 onReveal 一次 */
function StageCanvas({ play, onReveal }: { play: Play; onReveal: (r: Result) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reveal = useRef(onReveal);
  useEffect(() => {
    reveal.current = onReveal;
  }, [onReveal]);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { segs, result, shape } = play;
    const kept = result.kind === "monster" ? result.kept : [];
    // 怪圖：載好才畫（每格讀 complete，載得慢就晚一點淡入）
    let mob: HTMLImageElement | undefined;
    if (result.kind === "monster") {
      mob = new Image();
      mob.src = monsterImage(result.id);
    }
    let raf = 0;
    let revealed = false;
    const t0 = performance.now();
    const frame = (now: number) => {
      const ms = Math.min(TOTAL_MS + 1, now - t0);
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const img = mob && mob.complete && mob.naturalWidth > 0 ? mob : undefined;
      drawStage(ctx, { w, h, segs, kept, result, mob: img, shape, ms, caption: false });
      if (!revealed && ms >= REVEAL_MS) {
        revealed = true;
        reveal.current(result);
      }
      // 停在最後一格，但怪圖還沒載到就再等等
      if (ms <= TOTAL_MS || (mob && !img && now - t0 < TOTAL_MS + 8000)) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [play]);

  return (
    <canvas
      ref={ref}
      data-stage
      role="img"
      aria-label={play.result.kind === "monster" ? `筆畫變成${play.result.n}` : "筆畫掉下來堆成一坨"}
      className="block aspect-[4/5] w-full rounded-[var(--radius-card)] border border-[#d8ccb4]"
    />
  );
}

export function RenameGame({ replay, shareSlot }: { replay?: Replay; shareSlot?: ReactNode }) {
  const router = useRouter();
  const match = useMatcher();
  const [state, setState] = useState<{ step: Step; ctx: Ctx }>(() =>
    replay ? { step: "running", ctx: { ...initialCtx(), lines: RUNNING_LINES } } : { step: "intro", ctx: initialCtx() },
  );
  const [play, setPlay] = useState<Play | null>(null);
  /** 分享連結解不開時的靜態結果卡 */
  const [still, setStill] = useState<{ id: number | "poop"; n: string | null } | null>(null);
  const [debug, setDebug] = useState(false);
  /** 每次重寫換一個 key，登記書整張換新 */
  const [padKey, setPadKey] = useState(0);
  const runId = useRef(0);

  const dispatch = useCallback((a: Action) => setState(s => next(s.step, a, s.ctx)), []);

  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
  }, []);

  const start = useCallback(
    async (msg: MatchIn, segs: Stroke[]) => {
      const id = ++runId.current;
      setPlay(null);
      const out = await match(msg);
      if (id !== runId.current) return;
      const result: Result = out.result ?? { kind: "empty" };
      if (result.kind === "empty") {
        dispatch({ type: "done", result });
        return;
      }
      setPlay({ segs, result, shape: out.pts ? { pts: out.pts } : undefined });
    },
    [dispatch, match],
  );

  // 分享連結重播
  useEffect(() => {
    if (!replay) return;
    const m = /(?:^#|&)r=([^&]+)/.exec(window.location.hash);
    const share = m ? decodeShare(m[1]) : null;
    if (share && share.id === replay.id && share.all.length > 0) {
      void start({ type: "replay", segs: share.all, id: share.id, kept: share.kept, score: share.score }, share.all);
      return;
    }
    // 解不開：靜態結果卡
    const shown = (n: string | null) => {
      setStill({ id: replay.id, n });
      const r: Result =
        replay.id === "poop" || !n
          ? { kind: "poop", score: 0 }
          : { kind: "monster", id: replay.id, n, kept: [], score: 0, xf: { sx: 1, sy: 1, dx: 0, dy: 0 } };
      setState({ step: "result", ctx: { ...initialCtx(), lines: resultLines(r), result: r } });
    };
    if (replay.id === "poop") shown(null);
    else void match({ type: "shape", id: replay.id }).then(out => shown(out.n));
  }, [replay, start, match]);

  const submit = useCallback(
    (raw: Stroke[]) => {
      const segs = normalize(splitAtCorners(raw)).filter(s => s.length > 0);
      dispatch({ type: "submit", segs: segs.length });
      if (segs.length > 0) void start({ type: "match", segs }, segs);
    },
    [dispatch, start],
  );

  const reveal = useCallback((r: Result) => dispatch({ type: "done", result: r }), [dispatch]);

  const again = useCallback(() => {
    runId.current++;
    setPlay(null);
    setPadKey(k => k + 1);
    dispatch({ type: "again" });
  }, [dispatch]);

  const { step, ctx } = state;
  const result = ctx.result;

  const onButton = (b: DlgButton) => {
    if (b === "close") router.push("/");
    else if (b === "no") dispatch({ type: "decline" });
    else if (b === "yes") dispatch({ type: "accept" });
    else if (b === "next") dispatch({ type: "page" });
  };

  const right: DlgButton[] = step === "intro" ? ["no", "yes"] : step === "result" && ctx.page === 0 ? ["next"] : [];
  const lines = step === "result" && ctx.page > 0 ? RESULT_PAGE2_LINES : step === "intro" ? introLines(ctx.declines) : ctx.lines;
  const stats =
    step === "result" && ctx.page === 0 && result?.kind === "monster" && play
      ? `筆畫 ${play.segs.length}→${result.kept.length}　像度 ${result.score}%`
      : null;

  return (
    <div className="space-y-3.5">
      <NpcDialog lines={lines} extra={stats} left={["close"]} right={right} onButton={onButton} />

      {step === "intro" ? <p className="text-center text-[14px] ink-soft">按「接受」才會拿到登記書</p> : null}

      {step === "sign" ? <SignPad key={padKey} onSubmit={submit} debug={debug} /> : null}

      {(step === "running" || step === "result") && play ? <StageCanvas play={play} onReveal={reveal} /> : null}
      {step === "running" && !play ? (
        <div role="status" className="grid aspect-[4/5] w-full place-items-center rounded-[var(--radius-card)] border border-[#d8ccb4] bg-[#fbf6ea] text-[14px] text-[#7a6a58]">
          比對中…
        </div>
      ) : null}

      {step === "result" && still ? (
        <div
          data-still
          className="grid aspect-[4/5] w-full place-items-center rounded-[var(--radius-card)] border border-[#d8ccb4] bg-[#fbf6ea]"
        >
          {still.id !== "poop" && still.n ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={monsterImage(still.id)} alt={still.n} className="max-h-[60%] max-w-[70%] object-contain [image-rendering:pixelated]" />
          ) : (
            <p className="text-[18px] font-bold text-[#3c3028]">測出來是一坨</p>
          )}
        </div>
      ) : null}

      {step === "result" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {shareSlot}
            {replay ? (
              <Link href="/plan/rename" data-act="mine" className={`${BTN_PLAIN} ${shareSlot ? "" : "col-span-2"}`}>
                換我寫
              </Link>
            ) : (
              <button type="button" data-act="again" className={`${BTN_PLAIN} ${shareSlot ? "" : "col-span-2"}`} onClick={again}>
                再寫一次
              </button>
            )}
          </div>
          {result?.kind === "monster" ? (
            <p className="text-center">
              <Link href={`/db/monsters/${result.id}`} data-act="where" className="text-[15px] font-extrabold text-[color:var(--maple)] underline-offset-4 hover:underline">
                {result.n}在哪打／怎麼去 →
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
