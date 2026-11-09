/**
 * IndexNow 的金鑰（v1.90）。不是秘密：IndexNow 的規則就是把金鑰放在網站上公開的檔案，
 * 搜尋引擎（Bing 等）抓 https://maplehelper.tw/<金鑰>.txt 比對內容，證明網址是這個網站送的。
 *
 * 檔案在 public/<金鑰>.txt，內容只有金鑰本身（不換行）。換金鑰要兩個一起改，pipeline/lib/indexnow.test.mjs 會擋。
 */
export const INDEXNOW_KEY = "c9ec481af57d6f95c450d721325f987a";

/** 只送正式網域；測試機、workers.dev 都不送 */
export const INDEXNOW_HOST = "maplehelper.tw";
