/**
 * 瀏覽器自己還原捲動位置（按上一頁／下一頁、重新整理）時直接跳，不從頂端一路滑過去。
 * 全站開了平滑捲動（globals.css），瀏覽器還原位置時也會跟著平滑，長頁面要滑一秒多才回到原位；
 * Next 換頁捲回頂端有自己的處理（<html data-scroll-behavior>），還原位置不經過 Next，要另外管。
 */
import { createHistoryTracker } from "@/lib/db-browse";

type Root = { style: { scrollBehavior: string }; getClientRects(): unknown };

/**
 * 放在 <head>：重新整理、按返回整頁重載時，瀏覽器一載入就開始還原位置，在那之前先關掉平滑捲動。
 * 使用者第一次自己操作時，由 HistoryScrollJump 恢復。
 */
export const restoreScrollBootstrap = `(function(){try{var n=performance.getEntriesByType("navigation")[0];if(n&&(n.type==="reload"||n.type==="back_forward"))document.documentElement.style.scrollBehavior="auto";}catch(e){}})();`;

/**
 * 按上一頁／下一頁的那一下先關掉平滑捲動，讓瀏覽器直接跳回原位；
 * 使用者下一次自己點、按鍵時再恢復，頁內的平滑捲動照舊。
 * restoring：這次載入瀏覽器就在還原位置，<head> 已經先關掉了（restoreScrollBootstrap）。
 */
export function jumpWhenRestoring(
  target: Pick<EventTarget, "addEventListener">,
  root: Root,
  { restoring = false }: { restoring?: boolean } = {},
) {
  createHistoryTracker(target, {
    traversing: restoring,
    onTraverse: () => {
      root.style.scrollBehavior = "auto";
      // 逼瀏覽器馬上套用，緊接著還原位置時才吃得到（Next 自己關平滑捲動時也這樣做）
      root.getClientRects();
    },
    onFresh: () => {
      root.style.scrollBehavior = "";
    },
  });
}
