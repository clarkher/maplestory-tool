"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createFingerScroll, nextHeader, type HeaderMotion } from "@/lib/header-hide";
import { NAV, activeNav } from "@/lib/nav";
import { MoonIcon, SunIcon } from "./Icons";

export function SiteHeader() {
  const pathname = usePathname();
  const { headerRef, hidden, reveal } = useHideOnSwipe(pathname);

  return (
    // 手指往下滑時整條往上收，剛好收掉自己的高度：黏在它下面的那一列移一樣的距離，一起動、中間不裂開。
    // 收著時拿掉下緣的陰影，不然會在畫面頂端留一條影子。
    // 只動 transform：切換白天／夜晚時邊框色、毛玻璃底不要跟著漸變。用鍵盤移進來就出來
    <header
      ref={headerRef}
      onFocus={reveal}
      className={`sticky top-0 z-40 border-b border-[color:var(--paper-edge)] glass-fill transition-transform duration-200 ease-out${hidden ? " -translate-y-full shadow-none!" : ""}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 tap-safe" aria-label="楓谷幫手首頁">
          <Image
            src="/brand-emblem.png"
            alt=""
            width={30}
            height={30}
            priority
            className="size-[30px] shrink-0"
          />
          <span className="hidden text-[17px] font-black tracking-tight min-[400px]:inline">楓谷幫手</span>
        </Link>

        <nav className="scroll-x -mx-1 flex flex-1 items-center gap-1 px-1" aria-label="主選單">
          {NAV.map(item => {
            const active = activeNav(pathname) === item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-bold transition-colors",
                  active
                    ? "bg-[color:var(--maple)] text-white shadow-sm"
                    : "text-[color:var(--ink-soft)] hover:bg-[color:var(--maple-wash)] hover:text-[color:var(--ink)]",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

/**
 * 手機上方被導覽列佔掉太多：手指往下滑時收起來，往上滑一點就出來（規則在 header-hide.ts）。
 * 網站自己捲（點一筆、按返回、重新整理回到原位）不收也不叫出來；換頁、用鍵盤移到導覽列上就出來。
 * 導覽列的高度、有沒有收起來，寫到 <html>（--header-h、data-header-hidden）：黏在導覽列下面的東西跟著走。
 */
function useHideOnSwipe(pathname: string) {
  const headerRef = useRef<HTMLElement>(null);
  const motion = useRef<HeaderMotion>({ hidden: false, lastY: 0, travel: 0 });
  const [hidden, setHidden] = useState(false);

  const reveal = useCallback(() => {
    motion.current = { ...motion.current, hidden: false, travel: 0 };
    setHidden(false);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    // offsetHeight 不受收起來的位移影響，一直是導覽列本身的高度；量好存著，捲動時不用每次重量
    let height = header.offsetHeight;
    const measure = () => {
      height = header.offsetHeight;
      root.style.setProperty("--header-h", `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);

    const finger = createFingerScroll(window);
    motion.current = { hidden: false, lastY: window.scrollY, travel: 0 };
    const onScroll = () => {
      const next = nextHeader(motion.current, { y: window.scrollY, byFinger: finger.scrolled(), headerHeight: height });
      if (next.hidden !== motion.current.hidden) setHidden(next.hidden);
      motion.current = next;
    };
    // 平板、觸控筆電用手指收起來之後改用觸控板、滑鼠滾輪往上捲：一樣叫得出來（只會叫出來，不會收）
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && motion.current.hidden) reveal();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      observer.disconnect();
      finger.dispose();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
    };
  }, [reveal]);

  // 換頁：新的一頁從頂端開始、或按返回回到原位，都不是手指滑的，導覽列出來。
  // 要在新頁面捲到錨點、捲到卡片之前就拿掉收起來的記號（layout effect，導覽列排在 <main> 前面，比它們先跑），
  // 不然新頁面照「導覽列收著」放好位置，導覽列一回來就蓋住標題
  useLayoutEffect(() => {
    document.documentElement.removeAttribute("data-header-hidden");
    reveal();
  }, [pathname, reveal]);

  // 跟導覽列同一個畫面更新：黏在它下面的那一列才會一起動
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute("data-header-hidden", hidden);
  }, [hidden]);

  return { headerRef, hidden, reveal };
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
    setReady(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("ms-theme", next);
    } catch {
      // 停用本機儲存時仍可切換，只是不會被記住
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="tap-safe grid size-10 shrink-0 place-items-center rounded-full text-[color:var(--ink-soft)] transition-colors hover:bg-[color:var(--maple-wash)] hover:text-[color:var(--ink)]"
      aria-label={theme === "dark" ? "切換為白天配色" : "切換為夜晚配色"}
      title={theme === "dark" ? "切換為白天配色" : "切換為夜晚配色"}
    >
      {ready && theme === "dark" ? <MoonIcon size={19} /> : <SunIcon size={19} />}
    </button>
  );
}
