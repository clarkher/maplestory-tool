// 本機查價頁：每秒拉一次狀態。按鈕只動剪貼簿跟本機 API，不碰遊戲。
const $ = s => document.querySelector(s);
const fmt = n => (n == null ? "—" : Number(n).toLocaleString("zh-TW"));
const md = ymd => (ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "—");
const WEEK = "日一二三四五六";
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const api = async (path, body) => {
  const res = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return res.json();
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
  const { name } = await api("/api/next", {});
  if (!name) return toast("今天的清單查完了");
  await copy(name);
  refresh();
};

$("#finish").onclick = async () => {
  $("#finish-msg").textContent = "推上去中…";
  try {
    const r = await api("/api/finish", {});
    $("#finish-msg").textContent = r.error ? `沒推上去：${r.error}`
      : r.pushed ? `已推上去 price-data（${r.sha.slice(0, 7)}）${r.committed ? "" : "，這次沒有新資料"}` : "commit 了但遠端沒收到，等一下再按一次";
  } catch (e) {
    $("#finish-msg").textContent = `沒推上去：連不上本機程式（${e.message}）`;
  }
};

function shotText(s) {
  if (s.status === "reading") return "讀圖中";
  if (s.status === "ok") {
    const base = `讀到 ${s.added} 筆新的${s.skipped ? `（${s.skipped} 筆重複略過）` : ""}${s.review ? `，${s.review} 筆要你看一眼` : ""}`;
    return `${base}${s.reason}`;
  }
  return s.reason;
}

function renderList(st) {
  const d = new Date(`${st.today}T00:00:00`);
  $("#title").textContent = `${st.server} 查價清單`;
  $("#sub").textContent = `${md(st.today)}（週${WEEK[d.getDay()]}）每天 5 件${d.getDay() === 1 ? "，今天週一多 4 件" : ""}`;
  const we = $("#watch-error");
  we.hidden = !st.watchError;
  we.textContent = st.watchError ? `截圖資料夾盯不住了，新截圖可能收不到：${st.watchError}（關掉重開這個工具）` : "";
  const changed = setHtml($("#list"), st.items.map(i => {
    const last = i.shots.at(-1);
    const bad = last && (!["ok", "reading"].includes(last.status) || last.moveFailed);
    const status = last ? shotText(last) : i.status === "current" ? "等你截圖" : "還沒查";
    return `<li class="${i.status === "current" ? "current" : ""}">
      <span class="name">${esc(i.name)}</span><span class="tag">${i.freq === "daily" ? "每天" : "每週"}</span>
      <span class="${bad ? "warn" : "muted"}">${esc(status)}</span>
      <button data-copy="${esc(i.name)}">複製</button></li>`;
  }).join(""));
  if (changed) {
    $("#list").querySelectorAll("[data-copy]").forEach(b => {
      b.onclick = async () => {
        const r = await api("/api/current", { name: b.dataset.copy });
        if (!r.ok) return toast(r.error ?? "切換失敗");
        await copy(b.dataset.copy);
        refresh();
      };
    });
  }
  setHtml($("#orphans"), st.orphans.map(o => `<p class="warn small">${esc(o.file)}：${esc(o.reason)}</p>`).join(""));
  $("#fxnote").textContent = st.fx.available ? "台幣用雪吉拉當天匯率換算（8591 賣家開價算的，不是成交價）" : "台幣：匯率資料累積中";
}

function changeCell(r) {
  if (r.changePct == null) return "—";
  if (r.changePct === 0) return "持平";
  return `<span class="${r.changePct > 0 ? "up" : "down"}">${r.changePct > 0 ? "漲" : "跌"} ${Math.abs(r.changePct)}%</span>`;
}

async function renderTable(fxAvailable) {
  const { rows } = await api("/api/summary");
  const html = rows.map(r => {
    if (!r.count) return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num muted" colspan="5">還沒有資料</td></tr>`;
    const ntd = r.ntd == null ? (fxAvailable ? "沒有那天的匯率" : "累積中") : `${r.ntd === 0 ? "不到 0.1" : fmt(r.ntd)} 元${r.fxExact ? "" : `（用 ${md(r.fxDate)} 匯率）`}`;
    const count = r.few ? `只有 ${r.count} 筆，參考就好` : `${r.count} 筆`;
    return `<tr data-item="${esc(r.item)}"><td>${esc(r.item)}</td><td class="num">${r.groups ? "照屬性分開" : fmt(r.median)}</td>
      <td class="num">${r.groups ? "—" : ntd}</td><td class="num">${changeCell(r)}</td><td class="num">${count}</td><td>${md(r.lastTradedAt)}</td></tr>`;
  }).join("");
  const body = $("#table tbody");
  if (setHtml(body, html)) {
    body.querySelectorAll("tr").forEach(tr => { tr.onclick = () => { openItem = tr.dataset.item; renderDetail(); }; });
  }
  // 價格有變（新截圖、確認、改數字）而且正開著某一件的明細，明細也跟著更新
  const sig = JSON.stringify(rows);
  if (openItem && sig !== tableSig) renderDetail();
  tableSig = sig;
}

function trendSvg(points, minDays, close) {
  if (points.length < minDays) return `<p class="muted small">累積中（走勢要 ${minDays} 天以上，現在 ${points.length} 天）</p>`;
  const W = 640, H = 200, P = 36;
  const vals = points.map(p => (unit === "ntd" && close ? p.median * close / 1e8 : p.median));
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = i => P + (i * (W - 2 * P)) / (points.length - 1);
  const y = v => H - P - ((v - lo) * (H - 2 * P)) / span;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="中間價走勢">
    <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="var(--accent)"/>`).join("")}
    <text x="${P}" y="${H - 8}">${md(points[0].date)}</text><text x="${W - P}" y="${H - 8}" text-anchor="end">${md(points.at(-1).date)}</text>
    <text x="4" y="${y(hi) + 4}">${fmt(Math.round(hi))}</text><text x="4" y="${y(lo) + 4}">${fmt(Math.round(lo))}</text></svg>`;
}

async function renderDetail() {
  if (!openItem) return;
  const d = await api(`/api/item?name=${encodeURIComponent(openItem)}`);
  const s = d.summary;
  const close = s.ntd != null && s.median ? (s.ntd * 1e8) / s.median : null;
  if (unit === "ntd" && !close) unit = "meso";
  const groups = s.groups ? `<p>${s.groups.map(g => `${esc(g.key || "沒讀到屬性")}：${fmt(g.median)}（${g.count} 筆）`).join("　")}</p>` : "";
  const trend = d.series.length
    ? d.series.map(g => `${g.key ? `<p class="small">${esc(g.key)}</p>` : ""}${trendSvg(g.points, d.minTrendDays, close)}`).join("")
    : `<p class="muted small">累積中（走勢要 ${d.minTrendDays} 天以上，現在 0 天）</p>`;
  $("#detail").hidden = false;
  $("#detail").innerHTML = `<h2>${esc(openItem)}</h2>${groups}
    <div class="bar"><button data-unit="meso" aria-pressed="${unit === "meso"}">楓幣</button><button data-unit="ntd" aria-pressed="${unit === "ntd"}" ${close ? "" : "disabled"}>台幣</button></div>
    ${trend}
    <table><thead><tr><th>交易日期</th><th class="num">價格</th><th class="num">單價</th><th class="num">數量</th><th>屬性</th><th>截圖</th></tr></thead><tbody>
    ${d.trades.map(t => `<tr><td>${md(t.tradedAt)}</td><td class="num">${fmt(t.price)}</td><td class="num">${fmt(t.unitPrice)}</td><td class="num">${fmt(t.qty)}</td>
      <td>${esc(t.attrs ? Object.entries(t.attrs).map(([k, v]) => `${k}+${v}`).join("、") : "")}</td>
      <td class="small ${t.status === "review" ? "warn" : "muted"}">${esc(t.shot)}${t.status === "review" ? "（待確認）" : ""}</td></tr>`).join("")}
    </tbody></table>`;
  $("#detail").querySelectorAll("[data-unit]").forEach(b => { b.onclick = () => { unit = b.dataset.unit; renderDetail(); }; });
}

async function renderReview() {
  const { trades } = await api("/api/review");
  $("#review-sec").hidden = !trades.length;
  const box = $("#review");
  const ids = trades.map(t => t.id).join();
  if (box.dataset.ids === ids) return; // 沒變就不重畫（不然正在打的字會被洗掉）
  box.dataset.ids = ids;
  box.innerHTML = trades.map(t => `<div class="review-card" data-id="${esc(t.id)}">
    <strong>${esc(t.item)}</strong> <span class="warn small">${esc(t.flags.join("、"))}</span>
    <canvas data-shot="${esc(t.shot)}" data-box="${esc(JSON.stringify(t.box))}"></canvas>
    <label>價格 <input data-k="price" inputmode="numeric" value="${esc(t.price ?? "")}"></label>
    <label>單價 <input data-k="unitPrice" inputmode="numeric" value="${esc(t.unitPrice ?? "")}"></label>
    <label>數量 <input data-k="qty" inputmode="numeric" value="${esc(t.qty ?? "")}"></label>
    <label>交易日期 <input data-k="tradedAt" value="${esc(t.tradedAt ?? "")}"></label>
    <div class="bar"><button data-act="confirm">數字是對的</button><button data-act="edit">照我改的存</button><button data-act="delete">刪掉這筆</button></div>
    <p class="warn small card-msg" role="status" hidden></p></div>`).join("");
  box.querySelectorAll("canvas").forEach(drawCrop);
  box.querySelectorAll(".review-card").forEach(card => {
    const msg = card.querySelector(".card-msg");
    card.querySelectorAll("[data-act]").forEach(b => {
      b.onclick = async () => {
        const patch = {};
        card.querySelectorAll("[data-k]").forEach(i => { if (i.value.trim() !== "") patch[i.dataset.k] = i.dataset.k === "tradedAt" ? i.value.trim() : Number(i.value.replace(/,/g, "")); });
        const r = await api("/api/trade", { id: card.dataset.id, action: b.dataset.act, patch });
        if (!r.ok) {
          msg.textContent = SAVE_FAIL;
          msg.hidden = false;
          return;
        }
        box.dataset.ids = "";
        refresh();
      };
    });
  });
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
    const st = await api("/api/state");
    if (lost) { lost = false; toast(""); }
    renderList(st);
    await Promise.all([renderTable(st.fx.available), renderReview()]);
  } catch (e) {
    lost = true;
    toast(`連不上本機程式（${e.message}），它是不是被關掉了？`);
  } finally {
    refreshing = false;
  }
}

refresh();
setInterval(refresh, 1000);
