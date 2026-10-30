import Link from "next/link";
import { ChevronRight } from "./Icons";
import { LoadingBlock } from "./PlanShell";

/**
 * 查資料頁還在讀網址參數、載資料時的畫面：麵包屑跟標題跟 DbBrowser 畫的一模一樣，只有下面換成轉圈。
 * 伺服器先畫這一份，搜尋引擎不跑 JavaScript 也看得到這頁是什麼；載完標題不動，只有轉圈換成清單。
 */
export function DbFallback({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="space-y-4 py-3 sm:py-6">
      <nav aria-label="麵包屑" className="flex items-center gap-1 text-sm ink-faint">
        <Link href="/" className="hover:text-[color:var(--maple)]">我的路線</Link>
        <ChevronRight size={13} />
        <span className="text-[color:var(--ink-soft)]">{title}</span>
      </nav>
      <header>
        <h1 className="text-[26px] font-black tracking-tight sm:text-[32px]">{title}</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed ink-soft">{lead}</p>
      </header>
      <LoadingBlock />
    </div>
  );
}
