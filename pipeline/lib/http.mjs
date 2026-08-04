import fs from "node:fs";
import path from "node:path";

/**
 * 帶重試與節流的 fetch。maplestory.io 偶爾會 502/超時，所以失敗要退讓重試，
 * 不要讓整批爬蟲因為單張地圖掛掉。
 */
export async function fetchJson(url, { retries = 4, timeoutMs = 45000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": "maplestory-tool/0.1 (data pipeline)" },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(400 * 2 ** attempt + Math.floor(Math.random() * 300));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`fetch failed: ${url} (${lastError?.message ?? "unknown"})`);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 固定並行數的工作池，回傳與 items 同索引的結果陣列。 */
export async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export function writeJson(filePath, value, { pretty = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value));
  return fs.statSync(filePath).size;
}

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 讓長時間爬蟲有可讀的進度輸出，而不是靜默好幾分鐘。 */
export function progress(label, total) {
  let done = 0;
  let lastPrint = 0;
  return () => {
    done += 1;
    const now = Date.now();
    if (done === total || now - lastPrint > 3000) {
      lastPrint = now;
      const pct = ((done / total) * 100).toFixed(1);
      process.stdout.write(`\r${label} ${done}/${total} (${pct}%)   `);
      if (done === total) process.stdout.write("\n");
    }
  };
}
