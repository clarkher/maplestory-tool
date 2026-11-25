"use client";

/**
 * 名字變怪物的分享（v2.74 使用者選 A）：大顆［發影片到社群］，下面一排［傳連結給朋友］［複製連結］［存圖］。
 * 影片在演出時就在背後錄好（useRoundVideo），按一下直接跳系統分享、影片已附上，同一下把「一句話＋這一輪的連結」複製好。
 * 系統分享收不了影片檔（電腦、App 內建瀏覽器）→ 大顆寫［下載影片］；錄不了影片 → 大顆維持［傳給朋友］（v2.60）。
 * 連結裡帶的是正規化後的筆畫（#r=...，不會送到伺服器）；第一次分享前在按鈕下面寫明「連結裡會帶你寫的字」。
 * 影片 720×1280、圖 1080×1350，都用演出的 drawStage（caption: true，片尾帶站名網址）畫，在瀏覽器裡做。
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { track } from "@/lib/analytics";
import type { Result } from "@/lib/rename/match";
import type { VideoState } from "@/lib/rename/round-video";
import { canSendVideo, copyText, deliver, fileExt, sendText, sendVideo, shareLink, shareUrl, stageImage, VIDEO } from "@/lib/rename/share";
import { drawStage } from "@/lib/rename/stage";
import type { Pt, Stroke } from "@/lib/rename/strokes";
import { BTN_PLAIN, BTN_SEND } from "./SignPad";
import { loadMob } from "./useRoundVideo";

export type ShareRound = {
  segs: Stroke[];
  result: Exclude<Result, { kind: "empty" }>;
  shape: { pts: Pt[] } | undefined;
};

/** children：跟主按鈕並排的另一顆（再寫一次）；video：背後錄的影片，null 或 failed＝錄不了 */
export function ShareMenu({ round, video, showNotice, children }: { round: ShareRound; video: VideoState | null; showNotice: boolean; children: ReactNode }) {
  const [busy, setBusy] = useState<null | "video" | "image">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  // 這個元件結果出來才掛上去（不在伺服器畫），一開始就查得到
  const [sendable] = useState(canSendVideo);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const { segs, result, shape } = round;
  const kept = result.kind === "monster" ? result.kept : [];
  const name = result.kind === "monster" ? result.n : "一坨";
  const fileBase = `楓谷幫手-名字變怪物-${name}`;
  const hasVideo = video !== null && video.status !== "failed";

  const say = (text: string) => live.current && setMsg(text);
  const link = () => `${window.location.origin}${shareUrl({ id: result.kind === "monster" ? result.id : "poop", score: result.score, all: segs, kept })}`;

  const copyLink = async () => {
    track("rename_share", { via: "link" });
    setShared(true);
    say((await copyText(link())) ? "連結複製好了，貼給朋友就能看你這一輪" : "複製不了，請長按網址列自己複製");
  };

  /** 手機、平板直接跳系統分享（帶連結），電腦或不支援就複製連結；按取消什麼都不說 */
  const send = async () => {
    track("rename_share", { via: "send" });
    setShared(true);
    const how = await shareLink({ text: sendText(result), url: link() });
    if (how === "copy") say("連結複製好了，貼給朋友就能看你這一輪");
    else if (how === "error") say("分享不了，按「複製連結」貼給朋友");
  };

  /** 影片已經錄好：同一次點擊裡複製文案、叫系統分享（中間不能等） */
  const postVideo = async () => {
    if (video?.status !== "ready") return;
    track("rename_share", { via: "video" });
    setShared(true);
    setBusy("video");
    setMsg(null);
    try {
      const { how, copied } = await sendVideo(video.blob, `${fileBase}.${fileExt(video.blob.type)}`, `${sendText(result)} ${link()}`);
      const pasted = copied ? "文案和連結複製好了，貼上就能發" : null;
      if (how !== "download") {
        if (pasted) say(pasted);
        return;
      }
      const touch = matchMedia("(pointer: coarse)").matches;
      say(["影片存到下載資料夾了", pasted, touch ? "用 Safari 或 Chrome 開這頁，就能直接發" : null].filter(Boolean).join("。"));
    } finally {
      if (live.current) setBusy(null);
    }
  };

  const saveImage = async () => {
    track("rename_share", { via: "image" });
    setShared(true);
    setBusy("image");
    setMsg(null);
    try {
      const mob = result.kind === "monster" ? await loadMob(result.id) : undefined;
      const blob = await stageImage((ctx, w, h) => drawStage(ctx, { w, h, segs, kept, result, mob, shape, ms: VIDEO.ms, caption: true }));
      if (!blob) return say("這台瀏覽器做不出圖");
      const how = await deliver(blob, `${fileBase}.png`);
      if (how === "download") say("圖存好了（在下載資料夾）");
    } catch {
      say("沒存成功，再按一次試試");
    } finally {
      if (live.current) setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        {hasVideo ? (
          <button
            type="button"
            data-act="share"
            data-share="video"
            className={`${BTN_SEND} disabled:opacity-60`}
            disabled={video.status !== "ready" || busy !== null}
            onClick={() => void postVideo()}
          >
            {video.status !== "ready" ? "影片準備中…" : sendable ? "發影片到社群" : "下載影片"}
          </button>
        ) : (
          <button type="button" data-act="share" data-share="send" className={BTN_SEND} disabled={busy !== null} onClick={() => void send()}>
            傳給朋友
          </button>
        )}
        {children}
      </div>
      <div className={`grid gap-2 ${hasVideo ? "grid-cols-[1.45fr_1fr_0.8fr]" : "grid-cols-2"}`}>
        {hasVideo ? (
          <button type="button" data-share="send" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void send()}>
            傳連結給朋友
          </button>
        ) : null}
        <button type="button" data-share="link" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void copyLink()}>
          複製連結
        </button>
        <button type="button" data-share="image" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void saveImage()}>
          {busy === "image" ? "做圖中…" : "存圖"}
        </button>
      </div>
      {msg ? (
        <p role="status" data-share-msg className="text-center text-[14px] ink-soft">
          {msg}
        </p>
      ) : showNotice && !shared ? (
        <p className="text-center text-[13px] ink-soft">連結裡會帶你寫的字</p>
      ) : null}
    </div>
  );
}
