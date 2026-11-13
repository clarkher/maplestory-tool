/** 頁尾選單（v2.22 抽出來測）：有開贊助才在「聯絡我們」後面加「贊助楓谷幫手」 */
export function footerLinks(donateOpen: boolean): { href: string; text: string }[] {
  return [
    { href: "/about", text: "資料從哪來" },
    { href: "/privacy", text: "隱私權政策" },
    { href: "/terms", text: "服務條款" },
    { href: "/contact", text: "聯絡我們" },
    ...(donateOpen ? [{ href: "/support", text: "贊助楓谷幫手" }] : []),
  ];
}
