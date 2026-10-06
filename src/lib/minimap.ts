/**
 * 遊戲內小地圖的原始圖都很小（中位數 91×71px），直接放大到卡片滿版會整張糊掉。
 * 這裡只算「放大幾倍」：整數倍（1～3 倍）維持像素銳利，找得到塞得下的最大整數倍；
 * 連 1 倍都放不下（圖比容器還大，例如主圖 1265×701）才退而縮小，改用平滑縮放。
 */
export function minimapScale(naturalW: number, naturalH: number, maxW: number, maxH = 260): number {
  if (naturalW <= 0 || naturalH <= 0) return 1;

  for (let scale = 3; scale >= 1; scale--) {
    if (naturalW * scale <= maxW && naturalH * scale <= maxH) return scale;
  }
  return Math.min(maxW / naturalW, maxH / naturalH);
}
