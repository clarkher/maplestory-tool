// 本機查價頁：每秒拉一次狀態（分頁在背景就不拉）。按鈕只動剪貼簿跟本機 API，不碰遊戲。
const $ = s => document.querySelector(s);
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("zh-TW"));
const fmt1 = n => Number(n).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
const md = ymd => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "—");
const WEEK = "日一二三四五六";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const total = (shots, k) => shots.reduce((a, s) => a + (s[k] ?? 0), 0);

/** 本機程式回了錯（HTTP 不是 2xx）：message 就是它寫的原因；status、data 留給要分辨的地方看 */
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
const api = async (path, body) => {
  let res;
  try {
    res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  } catch (e) {
    throw new Error(`連不上本機程式（${e.message}），它是不是被關掉了？`);
  }
  let data = null;
  try { data = await res.json(); } catch { /* 回的不是 JSON */ }
  if (!res.ok) throw new ApiError(data?.error ?? `本機程式回了 ${res.status}`, res.status, data);
  return data;
};
/** 內容一樣就不重畫（不然每秒洗一次，選到的字、按到一半的按鈕都會被洗掉）；有重畫回傳 true */
const setHtml = (el, html) => {
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
};

const SAVE_FAIL = "沒存到：這筆的價格、單價、數量要是正整數而且對得起來（單價×數量＝總價），日期要 2026-10-12 這種寫法；單價空著的要先填好再按「照我改的存」";

let openItem = null;
let unit = "meso";
let tableSig = "";

async function copy(name) {
  try { await navigator.clipboard.writeText(name); toast(`已複製：${name}`); }
  catch { toast(`複製失敗，請手動選取：${name}`); }
}
function toast(s) { $("#toast").textContent = s; }

$("#next").onclick = async () => {
  try {
    const { name } = await api("/api/next", {});
    if (!name) return toast("今天的清單查完了");
    await copy(name);
    refresh();
  } catch (e) {
    toast(`沒辦法換下一件：${e.message}`);
  }
};

$("#finish").onclick = async () => {
  $("#finish-msg").textContent = "推上去中…";
  try {
    const r = await api("/api/finish", {});
    $("#finish-msg").textContent = r.pushed ? `已推上去 price-data（${r.sha.slice(0, 7)}）${r.committed ? "" : "，這次沒有新資料"}` : "commit 了但遠端沒收到，等一下再按一次";
  } catch (e) {
    $("#finish-msg").textContent = `沒推上去：${e.message}`;
  }
};

/** 一件的狀態列：累計讀到幾筆、中間價、黃色的原因（最後一張失敗就黃；搬不進已記價也黃） */
function itemStatus(i, row) {
  const last = i.shots.at(-1);
  if (!last) return [{ text: i.status === "current" ? "等你截圖" : "還沒查", warn: false }];
  const oks = i.shots.filter(s => s.status === "ok");
  const out = [];
  if (oks.length) {
    const skipped = total(oks, "skipped"), review = total(oks, "review");
    const median = row?.count ? `（中間價 ${row.groups ? "照屬性分開" : fmt(row.median)}）` : "";
    const notes = [...new Set(oks.map(s => s.reason).filter(Boolean))].join("");
    out.push({
      text: `讀到 ${total(oks, "added")} 筆新的${median}${skipped ? `（${skipped} 筆重複略過）` : ""}${review ? `，${review} 筆要你看一眼` : ""}${notes}`,
      warn: oks.some(s => s.moveFailed),
    });
  }
  if (last.status === "reading") out.push({ text: "讀圖中", warn: false });
  else if (last.status !== "ok") out.push({ text: `${oks.length ? "最後一張：" : ""}${last.reason}`, warn: true });
  return out;
}

function renderList(st, rows) {
  const d = new Date(`${st.today}T00:00:00`);
  const byItem = new Map(rows.map(r => [r.item, r]));
  $("#title").textContent = `${st.server} 查價清單`;
  $("#sub").textContent = `${md(st.today)}（週${WEEK[d.getDay()]}）每天 5 件${d.getDay() === 1 ? "，今天週一多 4 件" : ""}`;
  $("#watching").textContent = st.shotsDir ? `正在看：${st.shotsDir}` : "";
  const we = $("#watch-error");
  we.hidden = !st.watchError;
  we.textContent = st.watchError ? `截圖資料夾盯不住了，新截圖可能收不到：${st.watchError}（關掉重開這個工具）` : "";
  const changed = setHtml($("#list"), st.items.map(i => `<li class="${i.status === "current" ? "current" : ""}">
      <span class="name">${esc(i.name)}</span><span class="tag">${i.freq === "daily" ? "每天" : "每週"}</span>
      ${itemStatus(i, byItem.get(i.name)).map(o => `<span class="${o.warn ? "warn" : "muted"}">${esc(o.text)}</span>`).join("")}
      <button data-copy="${esc(i.name)}">複製</button></li>`).join(""));
  if (changed) {
    $("#list").querySelectorAll("[data-copy]").forEach(b => {
      b.onclick = async () => {
        try {
          await api("/api/current", { name: b.dataset.copy });
        } catch (e) {
          return toast(e.message);
        }
        await copy(b.dataset.copy);
        refresh();
      };
    });
  }
  setHtml($("#orphans"), st.orphans.map(o => `<p class="warn small">${esc(o.file)}：${esc(o.reason)}</p>`).join(""));
  $("#fxnote").textContent = st.fx.available ? "台幣用雪吉拉當天匯率換算（8591 賣家開價，少數幾天用參考站），不是成交價" : "台幣：匯率資料累積中";
}

/** 漲跌寫成字（漲／跌／持平），不用符號 */
function changeWords(pct) {
  if (pct == null) return "還沒有上次可比";
  if (pct === 0) return "持平";
  return `${pct > 0 ? "漲" : "跌"} ${Math.abs(pct)}%`;
}

function changeCell(r) {
  if (r.groups || r.changePct == null) return "—"; // 裝備不同屬性混在一起比沒意義，漲跌在明細裡每個屬性各自寫
  if (r.changePct === 0) return "持平";
  return `<span class="${r.changePct > 0 ? "up" : "down"}">${changeWords(r.changePct)}</span>`;
}

function renderTable(rows, fxAvailable) {
  const html = rows.map(r => {
    if (!r.count) return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num muted" colspan="4">還沒有資料</td><td class="hide-narrow"></td></tr>`;
    const ntd = r.ntd == null ? (fxAvailable ? "沒有那天的匯率" : "累積中") : `${r.ntd === 0 ? "不到 0.1" : fmt(r.ntd)} 元${r.fxExact ? "" : `（用 ${md(r.fxDate)} 匯率）`}`;
    const count = r.few ? `只有 ${r.count} 筆，參考就好` : `${r.count} 筆`;
    return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num">${r.groups ? "照屬性分開" : fmt(r.median)}</td>
      <td class="num">${r.groups ? "—" : ntd}</td><td class="num">${changeCell(r)}</td><td class="num">${count}</td><td class="hide-narrow">${md(r.lastTradedAt)}</td></tr>`;
  }).join("");
  const body = $("#table tbody");
  if (setHtml(body, html)) {
    body.querySelectorAll("tr").forEach(tr => { tr.onclick = () => { openItem = tr.dataset.item; showDetail(); }; });
  }
  // 價格有變（新截圖、確認、改數字）而且正開著某一件的明細，明細也跟著更新
  const sig = JSON.stringify(rows);
  if (openItem && sig !== tableSig) showDetail();
  tableSig = sig;
}

/** 走勢線：台幣用每個點自己那天的匯率換好的 ntd，那天沒有匯率的點不畫 */
function trendSvg(allPoints, minDays) {
  const ntd = unit === "ntd";
  const points = ntd ? allPoints.filter(p => p.ntd != null) : allPoints;
  if (points.length < minDays) {
    const noFx = allPoints.length - points.length;
    return `<p class="muted small">累積中（走勢要 ${minDays} 天以上，現在 ${points.length} 天${ntd && noFx ? `，另外 ${noFx} 天沒有匯率` : ""}）</p>`;
  }
  const W = 640, H = 200, P = 36;
  const vals = points.map(p => (ntd ? p.ntd : p.median));
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const label = v => (hi - lo < 10 ? fmt1(v) : fmt(Math.round(v))); // 差不到 10 的小數字，整數會看起來都一樣
  const x = i => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = v => H - P - ((v - lo) * (H - 2 * P)) / span;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="中間價走勢">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"/>`).join("")}
    <text x="${P}" y="${H - 8}">${md(points[0].date)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${md(points.at(-1).date)}</text>
    <text x="4" y="${y(hi) + 4}">${label(hi)}</text><text x="4" y="${y(lo) + 4}">${label(lo)}</text></svg>`;
}

const showDetail = () => renderDetail().catch(e => toast(e.message));
async function renderDetail() {
  if (!openItem) return;
  const d = await api(`/api/item?name=${encodeURIComponent(openItem)}`);
  const s = d.summary;
  const hasNtd = d.series.some(g => g.points.some(p => p.ntd != null));
  if (unit === "ntd" && !hasNtd) unit = "meso";
  // 裝備：每個屬性各自一行（中間價、筆數、比它自己上次的漲跌）
  const groups = s.groups ? s.groups.map(g => `<p>${esc(g.key || "沒讀到屬性")}：${fmt(g.median)}（${g.count} 筆，${changeWords(g.changePct)}）</p>`).join("") : "";
  const trend = d.series.length
    ? d.series.map(g => `${g.key ? `<p class="small">${esc(g.key)}</p>` : ""}${trendSvg(g.points, d.minTrendDays)}`).join("")
    : `<p class="muted small">累積中（走勢要 ${d.minTrendDays} 天以上，現在 0 天）</p>`;
  $("#detail").hidden = false;
  $("#detail").innerHTML = `<h2>${esc(openItem)}</h2>${groups}
    <div class="bar"><button data-unit="meso" aria-pressed="${unit === "meso"}">楓幣</button><button data-unit="ntd" aria-pressed="${unit === "ntd"}" ${hasNtd ? "" : "disabled"}>台幣</button></div>
    ${trend}
    <table><thead><tr><th>交易日期</th><th class="num">價格</th><th class="num">單價</th><th class="num">數量</th><th>屬性</th><th class="hide-narrow">截圖</th></tr></thead><tbody>
    ${d.trades.map(t => `<tr><td class="${t.status === "review" ? "warn" : ""}">${md(t.tradedAt)}</td><td class="num">${fmt(t.price)}</td><td class="num">${fmt(t.unitPrice)}</td><td class="num">${fmt(t.qty)}</td>
      <td>${esc(t.attrs ? Object.entries(t.attrs).map(([k, v]) => `${k}+${v}`).join("、") : "")}</td>
      <td class="small hide-narrow ${t.status === "review" ? "warn" : "muted"}">${esc(t.shot)}${t.status === "review" ? "（待確認）" : ""}</td></tr>`).join("")}
    </tbody></table>`;
  $("#detail").querySelectorAll("[data-unit]").forEach(b => { b.onclick = () => { unit = b.dataset.unit; showDetail(); }; });
}

/** 重畫之前記下使用者正在打的字（照這筆的 id）：只記跟畫面上原值不同的欄位，還有「沒存到」的說明跟游標在哪個欄位 */
function rememberTyping(box) {
  const typed = {};
  box.querySelectorAll(".review-card").forEach(card => {
    const values = {};
    card.querySelectorAll("[data-k]").forEach(i => { if (i.value !== i.dataset.orig) values[i.dataset.k] = i.value; });
    const msg = card.querySelector(".card-msg");
    const note = msg && !msg.hidden ? msg.textContent : "";
    if (Object.keys(values).length || note) typed[card.dataset.id] = { values, note };
  });
  const a = document.activeElement;
  const focus = a && a.dataset?.k && box.contains(a) ? { id: a.closest(".review-card").dataset.id, k: a.dataset.k, at: a.selectionStart } : null;
  return { typed, focus };
}

/** 重畫之後放回去：這筆還在的就把打到一半的字、說明、游標都還給它 */
function restoreTyping(box, { typed, focus }) {
  box.querySelectorAll(".review-card").forEach(card => {
    const keep = typed[card.dataset.id];
    if (!keep) return;
    for (const [k, v] of Object.entries(keep.values)) {
      const input = card.querySelector(`[data-k="${k}"]`);
      if (input) input.value = v;
    }
    if (keep.note) {
      const msg = card.querySelector(".card-msg");
      msg.textContent = keep.note;
      msg.hidden = false;
    }
  });
  if (focus) {
    const card = [...box.querySelectorAll(".review-card")].find(c => c.dataset.id === focus.id);
    const input = card?.querySelector(`[data-k="${focus.k}"]`);
    if (input) {
      input.focus();
      try { input.setSelectionRange(focus.at, focus.at); } catch { /* 這種輸入框不支援游標位置就算了 */ }
    }
  }
}

function renderReview(trades) {
  $("#review-sec").hidden = !trades.length;
  const box = $("#review");
  const ids = trades.map(t => t.id).join();
  if (box.dataset.ids === ids) return; // 沒變就不重畫（不然正在打的字會被洗掉）
  box.dataset.ids = ids;
  const typing = rememberTyping(box); // 清單變了要重畫：正在打的字先記起來，畫完放回去
  // data-orig＝畫這張卡時的原值：按「照我改的存」只送跟它不一樣的欄位
  const field = (label, k, v, attrs = "") => `<label>${label} <input data-k="${k}" ${attrs} value="${esc(v ?? "")}" data-orig="${esc(v ?? "")}"></label>`;
  box.innerHTML = trades.map(t => `<div class="review-card" data-id="${esc(t.id)}">
    <strong>${esc(t.item)}</strong> <span class="warn small">${esc(t.flags.join("、"))}</span>
    <canvas data-shot="${esc(t.shot)}" data-box="${esc(JSON.stringify(t.box))}"></canvas>
    ${field("價格", "price", t.price, 'inputmode="numeric"')}
    ${field("單價", "unitPrice", t.unitPrice, 'inputmode="numeric"')}
    ${field("數量", "qty", t.qty, 'inputmode="numeric"')}
    ${field("交易日期", "tradedAt", t.tradedAt)}
    <div class="bar"><button data-act="confirm">數字是對的</button><button data-act="edit">照我改的存</button><button data-act="delete">刪掉這筆</button></div>
    <p class="warn small card-msg" role="status" hidden></p></div>`).join("");
  box.querySelectorAll("canvas").forEach(drawCrop);
  box.querySelectorAll(".review-card").forEach(card => {
    const msg = card.querySelector(".card-msg");
    const fail = text => { msg.textContent = text; msg.hidden = false; };
    card.querySelectorAll("[data-act]").forEach(b => {
      b.onclick = async () => {
        const body = { id: card.dataset.id, action: b.dataset.act };
        if (b.dataset.act === "edit") {
          body.patch = reviewPatch([...card.querySelectorAll("[data-k]")].map(i => ({ k: i.dataset.k, value: i.value, orig: i.dataset.orig })));
        }
        try {
          await api("/api/trade", body);
        } catch (e) {
          // 400 加 ok:false ＝ 本機程式看過這筆、數字不能存；其他（連不上、500）照它說的原因
          return fail(e instanceof ApiError && e.status === 400 && e.data?.ok === false ? SAVE_FAIL : `沒存到：${e.message}`);
        }
        box.dataset.ids = "";
        refresh();
      };
    });
  });
  restoreTyping(box, typing);
}

function drawCrop(canvas) {
  const b = JSON.parse(canvas.dataset.box || "null");
  const img = new Image();
  img.onload = () => {
    const pad = 40;
    const sx = b ? Math.max(0, b.x - pad) : 0, sy = b ? Math.max(0, b.y - pad) : 0;
    const sw = b ? Math.min(img.width - sx, b.w + pad * 2) : img.width, sh = b ? Math.min(img.height - sy, b.h + pad * 2) : img.height;
    canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (b) { ctx.strokeStyle = "#e0a800"; ctx.lineWidth = 2; ctx.strokeRect(b.x - sx, b.y - sy, b.w, b.h); }
  };
  img.src = `/shot?file=${encodeURIComponent(canvas.dataset.shot)}`;
}

let refreshing = false;
let lost = false;
async function refresh() {
  if (refreshing) return; // 上一輪還沒回來就不疊上去
  refreshing = true;
  try {
    const [st, { rows }, { trades }] = await Promise.all([api("/api/state"), api("/api/summary"), api("/api/review")]);
    if (lost) { lost = false; toast(""); }
    renderList(st, rows);
    renderTable(rows, st.fx.available);
    renderReview(trades);
  } catch (e) {
    lost = true;
    toast(e instanceof ApiError ? `本機程式回報錯誤：${e.message}` : e.message);
  } finally {
    refreshing = false;
  }
}

refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 1000); // 分頁在背景就不拉，省得白讀檔
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
