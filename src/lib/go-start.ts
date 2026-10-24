/** 「帶我去」記的起點城鎮（GoNavigator 寫、/plan/buy 讀來挑最近的店）：localStorage 的地圖編號 */
export const GO_START_KEY = "ms-go-start";

/** 讀不到、停用本機儲存、不是正整數都回 null */
export function readGoStart(): number | null {
  try {
    const value = Number(localStorage.getItem(GO_START_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
