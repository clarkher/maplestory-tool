"use client";

/**
 * 名字變怪物的分享：大顆［傳給朋友］按一下就跳系統分享（電腦複製連結），下面一排攤開複製連結／存圖／存影片
 * （v2.60；以前要先點開選單、按鈕在手機畫面外，上線當天半小時玩 66 次只分享 2 次）。
 * 連結裡帶的是正規化後的筆畫（#r=...，不會送到伺服器）；第一次分享前在按鈕下面寫明「連結裡會帶你寫的字」。
 * 手機錄完影片（約 6 秒）按下去那次的動作已過期、系統分享會被擋，所以錄好先放一顆「分享影片」讓使用者再按一次；電腦直接下載。
 * 影片 720×1280、圖 1080×1350，都用演出的 drawStage（caption: true，片尾帶站名網址）畫，在瀏覽器裡做。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { track } from "@/lib/analytics";
import { monsterImage } from "@/lib/asset-paths";
import type { Result } from "@/lib/rename/match";
import { canRecordVideo, copyText, deliver, downloadBlob, fileExt, recordVideo, shareableFile, sendText, shareFile, shareLink, shareUrl, stageImage, VIDEO } from "@/lib/rename/share";
import { drawStage } from "@/lib/rename/stage";
import type { Pt, Stroke } from "@/lib/rename/strokes";
import { BTN_PLAIN, BTN_PRIMARY, BTN_SEND } from "./SignPad";

export type ShareRound = {
  segs: Stroke[];
  result: Exclude<Result, { kind: "empty" }>;
  shape: { pts: Pt[] } | undefined;
};

type Busy = null | "video" | "image";

const FAILED = "沒存成功，再按一次試試";

/** 怪圖載好（或載不到）才往下；最多等 4 秒 */
function loadMob(id: number): Promise<HTMLImageElement | undefined> {
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => resolve(undefined), 4000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(undefined);
    };
    img.src = monsterImage(id);
  });
}

/** children：跟［傳給朋友］並排的另一顆（再寫一次） */
export function ShareMenu({ round, showNotice, children }: { round: ShareRound; showNotice: boolean; children: ReactNode }) {
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  /** 手機錄好、等使用者再按一次「分享影片」的檔案 */
  const [videoFile, setVideoFile] = useState<File | null>(null);
  /** 錄得了影片才放「存影片」；伺服器端先當不行，畫面出來再查 */
  const [canRecord, setCanRecord] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    setCanRecord(canRecordVideo());
  }, []);
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

  const say = (text: string) => live.current && setMsg(text);

  const mob = useCallback(async () => (result.kind === "monster" ? loadMob(result.id) : undefined), [result]);

  const copyLink = async () => {
    track("rename_share", { via: "link" });
    setShared(true);
    const url = `${window.location.origin}${shareUrl({ id: result.kind === "monster" ? result.id : "poop", score: result.score, all: segs, kept })}`;
    say((await copyText(url)) ? "連結複製好了，貼給朋友就能看你這一輪" : "複製不了，請長按網址列自己複製");
  };

  /** 主按鈕：手機、平板直接跳系統分享（帶連結），電腦或不支援就複製連結；按取消什麼都不說 */
  const send = async () => {
    track("rename_share", { via: "send" });
    setShared(true);
    const url = `${window.location.origin}${shareUrl({ id: result.kind === "monster" ? result.id : "poop", score: result.score, all: segs, kept })}`;
    const how = await shareLink({ text: sendText(result), url });
    if (how === "copy") say("連結複製好了，貼給朋友就能看你這一輪");
    else if (how === "error") say("分享不了，按「複製連結」貼給朋友");
  };

  const saveImage = async () => {
    track("rename_share", { via: "image" });
    setShared(true);
    setBusy("image");
    setMsg(null);
    try {
      const img = await mob();
      const blob = await stageImage((ctx, w, h) =>
        drawStage(ctx, {
          w,
          h,
          segs,
          kept,
          result,
          mob: img,
          shape,
          ms: VIDEO.ms,
          caption: true,
        }),
      );
      if (!blob) return say("這台瀏覽器做不出圖");
      const how = await deliver(blob, `${fileBase}.png`);
      if (how === "download") say("圖存好了（在下載資料夾）");
    } catch {
      say(FAILED);
    } finally {
      if (live.current) setBusy(null);
    }
  };

  const saveVideo = async () => {
    track("rename_share", { via: "video" });
    setShared(true);
    setBusy("video");
    setMsg(null);
    setVideoFile(null);
    try {
      const img = await mob();
      const c = document.createElement("canvas");
      c.width = VIDEO.w;
      c.height = VIDEO.h;
      const ctx = c.getContext("2d");
      if (!ctx) return say("這台瀏覽器錄不了影片，可以改存圖");
      const blob = await recordVideo(c, ms =>
        drawStage(ctx, {
          w: VIDEO.w,
          h: VIDEO.h,
          segs,
          kept,
          result,
          mob: img,
          shape,
          ms,
          caption: true,
        }),
      );
      if (!blob) return say("這台瀏覽器錄不了影片，可以改存圖");
      const fileName = `${fileBase}.${fileExt(blob.type)}`;
      const file = shareableFile(blob, fileName);
      if (file) {
        if (live.current) setVideoFile(file);
        return say("影片錄好了，按「分享影片」傳出去");
      }
      downloadBlob(blob, fileName);
      say("影片存好了（在下載資料夾）");
    } catch {
      say(FAILED);
    } finally {
      if (live.current) setBusy(null);
    }
  };

  /** 新的一次點擊才叫系統分享；分享不了（權限、格式）改下載 */
  const sendVideo = async () => {
    const file = videoFile;
    if (!file) return;
    const how = await shareFile(file);
    if (how === "error") {
      downloadBlob(file, file.name);
      say("分享不了，影片改存到下載資料夾");
    } else if (how === "share") {
      if (live.current) setVideoFile(null);
      say("影片分享出去了");
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <button type="button" data-act="share" className={BTN_SEND} disabled={busy !== null} onClick={() => void send()}>
          傳給朋友
        </button>
        {children}
      </div>
      <div className={`grid gap-2 ${canRecord ? "grid-cols-3" : "grid-cols-2"}`}>
        <button type="button" data-share="link" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void copyLink()}>
          複製連結
        </button>
        <button type="button" data-share="image" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void saveImage()}>
          {busy === "image" ? "做圖中…" : "存圖"}
        </button>
        {canRecord ? (
          <button type="button" data-share="video" className={BTN_PLAIN} disabled={busy !== null} onClick={() => void saveVideo()}>
            {busy === "video" ? "錄影中…" : "存影片"}
          </button>
        ) : null}
      </div>
      {videoFile && busy === null ? (
        <button type="button" data-share="video-send" className={`${BTN_PRIMARY} w-full`} onClick={() => void sendVideo()}>
          分享影片
        </button>
      ) : null}
      {busy === "video" ? <p className="text-center text-[14px] ink-soft">影片照演出錄，大約 6 秒</p> : null}
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
