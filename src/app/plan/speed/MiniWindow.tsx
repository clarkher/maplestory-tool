// src/app/plan/speed/MiniWindow.tsx
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type PipApi = { requestWindow(options: { width: number; height: number }): Promise<Window> };

/** 瀏覽器支不支援子母畫面視窗（Document Picture-in-Picture，Chrome／Edge 116 起） */
export function pipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/**
 * 把這頁的樣式抄進小視窗。讀得到規則的樣式表直接抄內容；跨網域讀不到的（cssRules 會丟錯）改掛同一個網址。
 * 先放一個 <base>：小視窗的網址是 about:blank，樣式裡 /_next/... 開頭的字型網址才找得到。
 */
function copyStyles(target: Document) {
  const base = target.createElement("base");
  base.href = document.baseURI;
  target.head.appendChild(base);
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement("style");
      style.textContent = Array.from(sheet.cssRules, rule => rule.cssText).join("\n");
      target.head.appendChild(style);
    } catch {
      if (!sheet.href) continue;
      const link = target.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}

/** 白天／夜晚掛在 html 的這兩個屬性上（layout.tsx、SiteHeader 改的是 data-theme） */
const THEME_ATTRS = ["class", "data-theme"];

/**
 * 主頁的白天／夜晚抄到小浮窗（10/14）：一開就抄 from（主頁的 html）的 class、data-theme 到 to（小浮窗的 html），
 * 之後主頁換了（MutationObserver 只看這兩個屬性）跟著換，主頁拿掉的屬性浮窗也拿掉。回傳斷開監看的函式（關浮窗時呼叫）。
 * Observer 讓測試換成假的（測試跑在 node，沒有 DOM）。
 */
export function watchTheme(from: Element, to: Element, Observer: typeof MutationObserver = MutationObserver): () => void {
  const copy = () => {
    for (const name of THEME_ATTRS) {
      const value = from.getAttribute(name);
      if (value === null) to.removeAttribute(name);
      else to.setAttribute(name, value);
    }
  };
  copy();
  const observer = new Observer(copy);
  observer.observe(from, { attributes: true, attributeFilter: THEME_ATTRS });
  return () => observer.disconnect();
}

/**
 * 蓋在遊戲上面的小視窗：開一個子母畫面視窗、把這頁的樣式抄過去、內容用 portal 畫進去。
 * 開著的時候主頁換白天／夜晚，浮窗跟著換（watchTheme）。
 * open 變 false 或玩家自己關掉視窗都會收；onClose 讓頁面把按鈕狀態改回來（開不起來也會呼叫）。
 */
export function MiniWindow({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [pip, setPip] = useState<Window | null>(null);
  useEffect(() => {
    if (!open) return;
    let closed = false;
    let win: Window | null = null;
    let stopTheme: (() => void) | null = null;
    (window as unknown as { documentPictureInPicture: PipApi }).documentPictureInPicture.requestWindow({ width: 280, height: 150 }).then(
      created => {
        if (closed) {
          created.close();
          return;
        }
        win = created;
        copyStyles(created.document);
        created.document.documentElement.lang = document.documentElement.lang;
        stopTheme = watchTheme(document.documentElement, created.document.documentElement);
        // 字型變數（next/font）掛在 body 的 class 上，抄過去才是同一套字
        created.document.body.className = document.body.className;
        created.document.title = "練功測速";
        created.addEventListener("pagehide", () => {
          stopTheme?.();
          stopTheme = null;
          setPip(null);
          onClose();
        });
        setPip(created);
      },
      () => onClose(),
    );
    return () => {
      closed = true;
      stopTheme?.();
      stopTheme = null;
      win?.close();
      setPip(null);
    };
  }, [open, onClose]);
  return pip ? createPortal(children, pip.document.body) : null;
}
