"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./Icons";

const NAV = [
  { href: "/", label: "規劃" },
  { href: "/guide", label: "懶人包", match: "/guide" },
  { href: "/plan/bundle", label: "打包", match: "/plan/bundle" },
  { href: "/db/monsters", label: "怪物", match: "/db/monsters" },
  { href: "/db/items", label: "道具", match: "/db/items" },
  { href: "/db/quests", label: "任務", match: "/db/quests" },
  { href: "/db/skills", label: "技能", match: "/db/skills" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--paper-edge)] glass">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 tap-safe" aria-label="楓谷幫手首頁">
          <Image
            src="/brand-emblem.png"
            alt=""
            width={30}
            height={30}
            priority
            className="size-[30px] shrink-0"
          />
          <span className="text-[17px] font-black tracking-tight">楓谷幫手</span>
        </Link>

        <nav className="scroll-x -mx-1 flex flex-1 items-center gap-1 px-1" aria-label="主選單">
          {NAV.map(item => {
            const active = item.match ? pathname.startsWith(item.match) : pathname === "/";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
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
