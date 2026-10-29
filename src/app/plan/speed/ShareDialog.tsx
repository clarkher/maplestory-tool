// src/app/plan/speed/ShareDialog.tsx
"use client";

import { useEffect, useId, useState } from "react";
import { drawShareImage, type ShareCard } from "@/lib/speed/share-image";
import { Modal, SECOND } from "./Dialogs";
import { BUTTON_MAIN } from "./parts";

function canCopyImage(): boolean {
  return typeof ClipboardItem !== "undefined" && typeof navigator !== "undefined" && !!navigator.clipboard?.write;
}

/** 分享圖（S1 白天紙張，1200×630）：打開時畫一張，預覽＋「下載」＋（瀏覽器支援才有）「複製圖片」 */
export function ShareDialog({ card, onClose }: { card: ShareCard | null; onClose: () => void }) {
  const ids = useId();
  return (
    <Modal open={card !== null} labelledBy={`${ids}-title`} onCancel={onClose}>
      {card ? <ShareBody card={card} titleId={`${ids}-title`} onClose={onClose} /> : null}
    </Modal>
  );
}

function ShareBody({ card, titleId, onClose }: { card: ShareCard; titleId: string; onClose: () => void }) {
  const [image, setImage] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "no">("idle");
  const [copyable, setCopyable] = useState(false);

  useEffect(() => {
    setCopyable(canCopyImage());
    let cancelled = false;
    // 顏色固定白天紙張（SHARE_COLORS），深色主題下也一樣
    drawShareImage(card, getComputedStyle(document.body).fontFamily).then(
      canvas => {
        if (!cancelled) setImage({ url: canvas.toDataURL("image/png"), canvas });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [card]);

  const onCopy = () => {
    if (!image) return;
    image.canvas.toBlob(blob => {
      if (!blob) return setCopied("no");
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(
        () => setCopied("ok"),
        () => setCopied("no"),
      );
    }, "image/png");
  };

  return (
    <div>
      <h2 id={titleId} className="text-lg font-black">
        分享圖
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--paper-edge)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt="這段練功的分享圖" width={1200} height={630} className="block h-auto w-full" data-share-image />
        ) : (
          <p className="flex aspect-[1200/630] items-center justify-center text-sm ink-soft">{failed ? "畫不出來，等一下再過來。" : "正在畫…"}</p>
        )}
      </div>
      {copied === "ok" ? <p className="mt-2 text-[13px] font-bold text-[color:var(--leaf)]">複製好了，可以直接貼上。</p> : null}
      {copied === "no" ? <p className="mt-2 text-[13px] ink-soft">這個瀏覽器不讓複製，改按「下載」。</p> : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onClose} className={SECOND}>
          關掉
        </button>
        {copyable ? (
          <button type="button" onClick={onCopy} disabled={!image} className="rounded-full border border-[color:var(--paper-edge)] px-4 py-2 font-bold disabled:opacity-60">
            複製圖片
          </button>
        ) : null}
        {image ? (
          <a href={image.url} download={`練功測速-${card.date.replaceAll("/", "")}.png`} className={BUTTON_MAIN}>
            下載
          </a>
        ) : (
          <button type="button" disabled className={BUTTON_MAIN}>
            下載
          </button>
        )}
      </div>
    </div>
  );
}
