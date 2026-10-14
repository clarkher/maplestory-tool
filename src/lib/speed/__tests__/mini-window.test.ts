// src/lib/speed/__tests__/mini-window.test.ts
import { describe, expect, it } from "vitest";
import { watchTheme } from "@/app/plan/speed/MiniWindow";

/** 只有屬性的假元素（測試跑在 node，沒有 DOM） */
function fakeElement(attrs: Record<string, string> = {}) {
  const map = new Map(Object.entries(attrs));
  return {
    map,
    getAttribute: (name: string) => (map.has(name) ? (map.get(name) as string) : null),
    setAttribute: (name: string, value: string) => void map.set(name, value),
    removeAttribute: (name: string) => void map.delete(name),
  };
}

/** 假的 MutationObserver：記下看哪個元素、哪些屬性；fire() 當成屬性變了 */
function fakeObserver() {
  const made: { target: unknown; options: MutationObserverInit | undefined; connected: boolean; fire: () => void }[] = [];
  class Observer {
    record: (typeof made)[number];
    constructor(callback: () => void) {
      this.record = { target: null, options: undefined, connected: false, fire: () => this.record.connected && callback() };
      made.push(this.record);
    }
    observe(target: unknown, options?: MutationObserverInit) {
      this.record.target = target;
      this.record.options = options;
      this.record.connected = true;
    }
    disconnect() {
      this.record.connected = false;
    }
    takeRecords() {
      return [];
    }
  }
  return { made, Observer: Observer as unknown as typeof MutationObserver };
}

describe("小浮窗跟著換白天／夜晚：watchTheme（10/14）", () => {
  it("一開就抄 html 的 class、data-theme；只看這兩個屬性", () => {
    const page = fakeElement({ "data-theme": "dark", class: "a b", lang: "zh-Hant" });
    const pip = fakeElement();
    const { made, Observer } = fakeObserver();
    watchTheme(page as unknown as Element, pip as unknown as Element, Observer);
    expect(Object.fromEntries(pip.map)).toEqual({ "data-theme": "dark", class: "a b" });
    expect(made).toHaveLength(1);
    expect(made[0].target).toBe(page);
    expect(made[0].options).toEqual({ attributes: true, attributeFilter: ["class", "data-theme"] });
  });

  it("主頁換了跟著換；主頁拿掉的屬性浮窗也拿掉", () => {
    const page = fakeElement({ "data-theme": "light" });
    const pip = fakeElement({ class: "old" });
    const { made, Observer } = fakeObserver();
    watchTheme(page as unknown as Element, pip as unknown as Element, Observer);
    expect(Object.fromEntries(pip.map)).toEqual({ "data-theme": "light" });
    page.setAttribute("data-theme", "dark");
    page.setAttribute("class", "x");
    made[0].fire();
    expect(Object.fromEntries(pip.map)).toEqual({ "data-theme": "dark", class: "x" });
    page.removeAttribute("class");
    made[0].fire();
    expect(Object.fromEntries(pip.map)).toEqual({ "data-theme": "dark" });
  });

  it("關掉（呼叫回傳的函式）就斷開，之後主頁再換浮窗不動", () => {
    const page = fakeElement({ "data-theme": "light" });
    const pip = fakeElement();
    const { made, Observer } = fakeObserver();
    const stop = watchTheme(page as unknown as Element, pip as unknown as Element, Observer);
    stop();
    expect(made[0].connected).toBe(false);
    page.setAttribute("data-theme", "dark");
    made[0].fire();
    expect(pip.getAttribute("data-theme")).toBe("light");
  });
});
