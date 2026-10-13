// 盯截圖資料夾（Win+PrtSc 存到 Pictures\Screenshots）：新的 .png 大小停住不變才算寫完，通知一次。
// 開工前就在的圖不算；子資料夾（已記價）不看。
import fs from "node:fs";
import path from "node:path";

export function watchShots(dir, onShot, { stableMs = 500 } = {}) {
  const seen = new Set(fs.readdirSync(dir));
  const timers = new Map();
  const settle = (name, lastSize) => {
    timers.set(name, setTimeout(() => {
      let size;
      try { size = fs.statSync(path.join(dir, name)).size; } catch { timers.delete(name); return; }
      if (size > 0 && size === lastSize) {
        timers.delete(name);
        seen.add(name);
        onShot(path.join(dir, name));
      } else settle(name, size);
    }, stableMs));
  };
  const watcher = fs.watch(dir, (_event, name) => {
    if (!name || !/\.png$/i.test(name) || name.includes(path.sep) || seen.has(name) || timers.has(name)) return;
    settle(name, -1);
  });
  return () => {
    watcher.close();
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
