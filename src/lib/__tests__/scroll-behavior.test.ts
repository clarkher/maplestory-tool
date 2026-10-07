/**
 * 全站開了平滑捲動（globals.css）。Next 16 起，<html> 要帶 data-scroll-behavior="smooth"，
 * 換頁捲回頂端時 Next 才會先關掉平滑捲動直接跳；少了它，長頁面換頁會從底部一路滑上去。
 * 瀏覽器自己還原捲動位置（按上一頁／下一頁、重新整理）不經過 Next，要 layout 另外掛東西才會直接跳。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import { HistoryScrollJump } from "@/components/HistoryScrollJump";

// next/font 要靠 Next 編譯時換掉，在測試裡是空檔；這裡只看 <html> 的屬性，字型給個空殼
vi.mock("next/font/google", () => ({
  Noto_Sans_TC: () => ({ className: "", style: { fontFamily: "" }, variable: "" }),
}));

const css = fs.readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const smoothScroll = /scroll-behavior:\s*smooth/.test(css);

type El = { type: unknown; props: { children?: unknown; dangerouslySetInnerHTML?: { __html: string } } };
/** layout 這一層寫出來的 element 全部攤平（不展開裡面的元件） */
function elements(node: unknown): El[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as El;
  return [el, ...elements(el.props.children)];
}

describe("換頁捲回頂端", () => {
  it.skipIf(!smoothScroll)("全站開了平滑捲動，<html> 就要帶 data-scroll-behavior=\"smooth\"，換頁才會直接跳回頂端", () => {
    const html = RootLayout({ children: null });
    expect(html.type).toBe("html");
    expect(html.props["data-scroll-behavior"]).toBe("smooth");
  });
});

describe("瀏覽器還原捲動位置", () => {
  it.skipIf(!smoothScroll)("全站開了平滑捲動，每一頁都要掛 HistoryScrollJump，按上一頁／下一頁才會直接跳回原位", () => {
    expect(elements(RootLayout({ children: null })).some(el => el.type === HistoryScrollJump)).toBe(true);
  });

  it.skipIf(!smoothScroll)("<head> 的程式：重新整理進來時，畫面出來前先關掉平滑捲動；一般進來不動", () => {
    const head = elements(RootLayout({ children: null })).find(el => el.type === "head");
    const scripts = elements(head?.props.children).flatMap(el =>
      el.type === "script" && el.props.dangerouslySetInnerHTML ? [el.props.dangerouslySetInnerHTML.__html] : [],
    );
    const run = (type: string) => {
      const root = { style: { scrollBehavior: "" }, dataset: {} };
      const performance = { getEntriesByType: () => [{ type }] };
      for (const code of scripts) new Function("performance", "document", code)(performance, { documentElement: root });
      return root.style.scrollBehavior;
    };
    expect(run("reload")).toBe("auto");
    expect(run("navigate")).toBe("");
  });
});
