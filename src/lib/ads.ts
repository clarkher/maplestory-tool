/**
 * AdSense（v1.77）。編號不是秘密，寫在這裡或建置環境都可以；還沒有就什麼都不畫。
 *
 * TODO: 使用者開好 AdSense 帳號後填 ADSENSE_CLIENT（ca-pub-…）並加 public/ads.txt；審核過、開好版位再填 AD_UNITS。
 * 在 AdSense 後台不要開「自動廣告」：位置由 Google 決定會讓畫面跳動（11/06 拍板 1A：手動版位）。
 */
import { PRODUCTION_HOST } from "./analytics";

export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

export const AD_UNITS = {
  /** 單筆資料頁、攻略文的最底下 */
  detail: process.env.NEXT_PUBLIC_AD_UNIT_DETAIL || "",
  /** 攻略文中段 */
  article: process.env.NEXT_PUBLIC_AD_UNIT_ARTICLE || "",
};

export type AdUnit = keyof typeof AD_UNITS;

/** 只有正式網域真的載廣告：測試機、本機、我的驗收不灌假曝光（AdSense 禁止人為衝曝光）。 */
export function adsEnabledFor(hostname: string, client: string) {
  return hostname === PRODUCTION_HOST && client !== "";
}

/** 給 AdSense 驗證網站用的 meta；沒編號就不放。 */
export function adsenseMeta(): Record<string, string> {
  return ADSENSE_CLIENT ? { "google-adsense-account": ADSENSE_CLIENT } : {};
}
