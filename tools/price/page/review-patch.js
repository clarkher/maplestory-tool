// 「要你看一眼」那張卡：只把使用者真的改過的欄位送去存（一般 script，app.js 之前先載入；測試用 vm 跑）。
// 全部欄位都送的話，只改了總價，舊的單價也跟著送出去、單價×數量對不上，
// 本機程式那條「只改總價就自動算單價」永遠走不到，使用者只會看到「沒存到」。
// fields：[{ k: 欄位名, value: 輸入框現在的字, orig: 畫這張卡時的原值 }]
function reviewPatch(fields) {
  const patch = {};
  for (const { k, value, orig } of fields) {
    const v = String(value ?? "").trim();
    if (v === "") continue; // 空著不送
    const o = String(orig ?? "").trim();
    if (k === "tradedAt") {
      if (v !== o) patch[k] = v;
      continue;
    }
    // 數字：逗號、空白不同但數字一樣算沒改；亂填的（NaN）照送，讓本機程式擋下來、頁面才有得說明
    const n = Number(v.replace(/,/g, ""));
    const was = o === "" ? null : Number(o.replace(/,/g, ""));
    if (n !== was) patch[k] = n;
  }
  return patch;
}
