/**
 * 搜尋框按 Enter 要不要收起鍵盤：結果邊打邊出來，手機、平板按 Enter（鍵盤上寫「搜尋」）就是打完了，收起鍵盤看結果。
 * 注音、拼音選字時的 Enter 是確定選字，不收；電腦（滑鼠、觸控板）按 Enter 不動，焦點留著可以接著打。
 */
export function closesKeyboard(press: { key: string; isComposing: boolean; keyCode: number }, coarsePointer: boolean): boolean {
  // 有的瀏覽器選字時 keyCode 是 229、isComposing 卻沒標
  if (press.key !== "Enter" || press.isComposing || press.keyCode === 229) return false;
  return coarsePointer;
}
