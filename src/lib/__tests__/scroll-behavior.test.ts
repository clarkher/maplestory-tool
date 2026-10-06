/**
 * 全站開了平滑捲動（globals.css）。Next 16 起，<html> 要帶 data-scroll-behavior="smooth"，
 * 換頁捲回頂端時 Next 才會先關掉平滑捲動直接跳；少了它，長頁面換頁會從底部一路滑上去。
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";

// next/font 要靠 Next 編譯時換掉，在測試裡是空檔；這裡只看 <html> 的屬性，字型給個空殼
vi.mock("next/font/google", () => ({
  Noto_Sans_TC: () => ({ className: "", style: { fontFamily: "" }, variable: "" }),
}));

const css = fs.readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
const smoothScroll = /scroll-behavior:\s*smooth/.test(css);

describe("換頁捲回頂端", () => {
  it.skipIf(!smoothScroll)("全站開了平滑捲動，<html> 就要帶 data-scroll-behavior=\"smooth\"，換頁才會直接跳回頂端", () => {
    const html = RootLayout({ children: null });
    expect(html.type).toBe("html");
    expect(html.props["data-scroll-behavior"]).toBe("smooth");
  });
});
