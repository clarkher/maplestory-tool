"use client";

/**
 * 名字變怪物：整個流程用 NPC 對話框演（像真的接任務）。
 *   intro：NPC 問要不要登錄冒險者名冊［停止對話］［拒絕］［接受］，拒絕＝鬼打牆換句話繼續問
 *   sign：對話框下面出現登記書（SignPad）
 *   running：切段＋正規化後丟 Worker 比對，回來就播演出（stage.ts：寫字→收筆畫→變形→標題）；
 *            變形播完（標題開始）才切 result，NPC 說結果
 *   result：演出停在最後一格＋［分享（ShareMenu：複製連結／存影片／存圖）］［再寫一次］＋「{怪}在哪打／怎麼去 →」
 * 狀態轉換在 src/lib/rename/flow.ts（純函式、有測試）。
 *
 * replay（/plan/rename/m/[id] 分享頁）：一開場就從 location.hash 的 #r=... 解出筆畫重播；
 * 解不開就畫那隻怪的靜態結果卡＋［換我寫］（沒有筆畫可分享，不放［分享］）。
 * GA：按接受送 rename_start、自己那輪出結果送 rename_result（看別人的重播不送）、分享選一個送 rename_share（在 ShareMenu）。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { monsterImage } from "@/lib/asset-paths";
import { initialCtx, next, RESULT_PAGE2_LINES, RUNNING_LINES, type Action, type Ctx, type Step } from "@/lib/rename/flow";
import { introLines, replayLines } from "@/lib/rename/lines";
import type { Result } from "@/lib/rename/match";
import { createMatcher, type Matcher, type WorkerLike } from "@/lib/rename/matcher";
import { loadShapes, runMatch, type MatchIn, type MatchOut } from "@/lib/rename/run";
import { drawStage, TIMELINE } from "@/lib/rename/stage";
import { decodeShare, normalize, splitAtCorners, type Pt, type Stroke } from "@/lib/rename/strokes";
import { NpcDialog, type DlgButton } from "./NpcDialog";
import { ShareMenu, type ShareRound } from "./ShareMenu";
import { BTN_PLAIN, SignPad } from "./SignPad";

/** 標題開始的時間點：這時 NPC 改說結果 */
const REVEAL_MS = TIMELINE.write + TIMELINE.collect + TIMELINE.morph;
const TOTAL_MS = REVEAL_MS + TIMELINE.title;

type Play = { segs: Stroke[]; result: Result; shape: { pts: Pt[] } | undefined };
type Replay = { id: number | "poop" };

/**
 * 比對：派送在 src/lib/rename/matcher.ts（Worker 起不來、出錯、8 秒沒回就在主執行緒算；有測試）。
 * 卸載時 dispose（等著的丟 unmount，呼叫端不用再算）；React 嚴格模式卸載再掛一次，下次用到再重開一個 Worker。
 */
function useMatcher() {
  const matcher = useRef<Matcher | null>(null);
  const get = useCallback((): Matcher => {
    matcher.current ??= createMatcher({
      // new URL(...) 要寫在這裡 webpack 才會把 Worker 打包進去
      spawn: () => new Worker(new URL("./match.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike,
      fallback: async msg => runMatch(msg, await loadShapes(), Math.random),
    });
    return matcher.current;
  }, []);
  useEffect(() => () => matcher.current?.dispose(), []);
  return useCallback((msg: MatchIn): Promise<MatchOut> => get().match(msg), [get]);
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

export function RenameGame({ replay }: { replay?: Replay }) {
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

  /**
   * 分享頁沒辦法重播（hash 解不開，或重播比對失敗）：畫那隻怪的靜態結果卡＋［換我寫］，不給登記書。
   * 怪名從 shapes 查；查不到就當一坨。回傳的函式呼叫後就不再更新（卸載時用）。
   */
  const showStill = useCallback((): (() => void) => {
    if (!replay) return () => {};
    let live = true;
    const shown = (n: string | null) => {
      if (!live) return;
      setPlay(null);
      setStill({ id: replay.id, n });
      const r: Result =
        replay.id === "poop" || !n
          ? { kind: "poop", score: 0 }
          : { kind: "monster", id: replay.id, n, kept: [], score: 0, xf: { sx: 1, sy: 1, dx: 0, dy: 0 } };
      setState({ step: "result", ctx: { ...initialCtx(), lines: replayLines(r), result: r } });
    };
    if (replay.id === "poop") shown(null);
    else
      match({ type: "shape", id: replay.id }).then(
        out => shown(out.n),
        () => shown(null),
      );
    return () => {
      live = false;
    };
  }, [replay, match]);

  const start = useCallback(
    async (msg: MatchIn, segs: Stroke[]) => {
      const id = ++runId.current;
      setPlay(null);
      let out: MatchOut;
      try {
        out = await match(msg);
      } catch {
        // Worker 跟主執行緒都算不出來：回登記書請他再簽一次，不要卡在比對中
        // 分享頁重播失敗：改顯示靜態結果卡，不給登記書
        if (id === runId.current) {
          if (replay) showStill();
          else dispatch({ type: "fail" });
        }
        return;
      }
      if (id !== runId.current) return;
      const result: Result = out.result ?? { kind: "empty" };
      if (result.kind === "empty") {
        if (replay) showStill();
        else dispatch({ type: "done", result });
        return;
      }
      setPlay({ segs, result, shape: out.pts ? { pts: out.pts } : undefined });
    },
    [dispatch, match, replay, showStill],
  );

  // 分享連結重播
  useEffect(() => {
    if (!replay) return;
    const m = /(?:^#|&)r=([^&]+)/.exec(window.location.hash);
    const share = m ? decodeShare(m[1]) : null;
    if (share && share.id === replay.id && share.all.length > 0) {
      void start({ type: "replay", segs: share.all, id: share.id, kept: share.kept, score: share.score }, share.all);
      // 卸載（含嚴格模式卸載再掛）就作廢這一輪，晚到的結果不會蓋掉新的
      return () => {
        runId.current++;
      };
    }
    // 解不開：靜態結果卡
    return showStill();
  }, [replay, start, showStill]);

  const submit = useCallback(
    (raw: Stroke[]) => {
      const segs = normalize(splitAtCorners(raw)).filter(s => s.length > 0);
      dispatch({ type: "submit", segs: segs.length });
      if (segs.length > 0) void start({ type: "match", segs }, segs);
    },
    [dispatch, start],
  );

  const reveal = useCallback(
    (r: Result) => {
      if (!replay && r.kind !== "empty") track("rename_result", { result: r.kind === "monster" ? r.id : "poop", score: r.score });
      dispatch({ type: "done", result: r });
    },
    [dispatch, replay],
  );

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
    else if (b === "yes") {
      if (step === "intro") track("rename_start");
      dispatch({ type: "accept" });
    }
    else if (b === "next") dispatch({ type: "page" });
  };

  // 分享頁（看別人的登記書）：結果用 replayLines、一頁講完，不放［下頁］
  const right: DlgButton[] = step === "intro" ? ["no", "yes"] : step === "result" && ctx.page === 0 && !replay ? ["next"] : [];
  const lines =
    step === "result" && replay && result
      ? replayLines(result)
      : step === "result" && ctx.page > 0
        ? RESULT_PAGE2_LINES
        : step === "intro"
          ? introLines(ctx.declines)
          : ctx.lines;
  const stats =
    step === "result" && ctx.page === 0 && result?.kind === "monster" && play
      ? `筆畫 ${play.segs.length}→${result.kept.length}　像度 ${result.score}%`
      : null;

  // 有演出（自己寫的或解得開的重播）才能分享；靜態結果卡沒有筆畫
  const round: ShareRound | null = play && play.result.kind !== "empty" ? { segs: play.segs, result: play.result, shape: play.shape } : null;
  const other = replay ? (
    <Link href="/plan/rename" data-act="mine" className={BTN_PLAIN}>
      換我寫
    </Link>
  ) : (
    <button type="button" data-act="again" className={BTN_PLAIN} onClick={again}>
      再寫一次
    </button>
  );

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
          {round ? (
            <ShareMenu round={round} showNotice={!replay}>
              {other}
            </ShareMenu>
          ) : (
            <div className="grid grid-cols-1">{other}</div>
          )}
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
