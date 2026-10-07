"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * 瀏覽器接手（hydrate）伺服器送來的畫面了沒：伺服器上、接手的那一格一律是 false，接手後馬上換成 true。
 * 為什麼要有：瀏覽器第一次畫的那一格必須跟伺服器的 HTML 一模一樣；記住的搜尋字、篩選第一格就讀得到、伺服器卻沒有，
 * 這類畫面等接手後（hydrated 變 true）再照記住的值畫。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noSubscribe, onClient, onServer);
}
