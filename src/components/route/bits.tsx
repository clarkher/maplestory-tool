import Image from "next/image";
import type { ReactNode } from "react";
import type { Verified } from "@/lib/types";

/** 遊戲圖都是點陣小圖，放大時保持像素銳利 */
export function Sprite({ src, size = 32, className = "", alt = "" }: { src: string; size?: number; className?: string; alt?: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      className={`shrink-0 object-contain [image-rendering:pixelated] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

const VERIFIED_TEXT: Record<Verified, string> = {
  tw: "台服實測",
  community: "社群整理",
  legacy: "舊版經驗",
};

/** 每塊內容都標清楚從哪來：遊戲資料推算，還是玩家攻略（再分台服實測、社群整理、舊版經驗）。 */
export function SourceTag({ kind, verified }: { kind: "data" | "guide"; verified?: Verified }) {
  if (kind === "data") {
    return <span className="shrink-0 rounded-full bg-[color:var(--sky-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--sky)]">遊戲資料</span>;
  }
  return (
    <span className="shrink-0 rounded-full bg-[color:var(--gold-wash)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--gold)]">
      玩家攻略{verified ? `・${VERIFIED_TEXT[verified]}` : ""}
    </span>
  );
}

function sourceName(url: string): string {
  try {
    const { hostname, searchParams } = new URL(url);
    if (hostname.includes("forum.gamer.com.tw")) return `巴哈 ${searchParams.get("snA") ?? searchParams.get("sn") ?? ""}`.trim();
    if (hostname.includes("home.gamer.com.tw")) return "巴哈小屋";
    if (hostname.includes("bobogameguides")) return "波波攻略島";
    if (hostname.includes("mapleclassictools")) return "楓錄";
    if (hostname.includes("ptt.cc")) return "PTT";
    return hostname.replace(/^www\./, "");
  } catch {
    return "出處";
  }
}

export function SourceLinks({ urls, max = 3 }: { urls: string[]; max?: number }) {
  if (!urls.length) return null;
  const shown = urls.slice(0, max);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ink-faint">
      出處
      {shown.map(url => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="font-bold text-[color:var(--sky)] hover:underline">
          {sourceName(url)}
        </a>
      ))}
      {urls.length > max ? <span>等 {urls.length} 篇</span> : null}
    </p>
  );
}

export function Panel({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius-card)] glass wood-frame p-3.5 sm:p-4 ${className}`}>
      {title ? (
        <header className="mb-2.5 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-black">{title}</h2>
          {aside}
        </header>
      ) : null}
      {children}
    </section>
  );
}

/** 經驗換算成「約幾級」，太小的不顯示免得一堆 0.00 */
export function levelText(fraction: number): string | null {
  if (fraction >= 1) return `約 ${fraction.toFixed(1)} 級`;
  if (fraction >= 0.05) return `約 ${fraction.toFixed(2)} 級`;
  return null;
}
