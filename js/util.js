/* Shared helpers */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

const NF = {};
function fmt(v, d = 1) {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "–";
  const key = LANG + d;
  if (!NF[key]) NF[key] = new Intl.NumberFormat(LANG === "vi" ? "vi-VN" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  return NF[key].format(v);
}
function fmtBig(v) {
  if (v === null || v === undefined) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return fmt(v / 1e9, 2) + (LANG === "vi" ? " tỷ" : "B");
  if (a >= 1e6) return fmt(v / 1e6, 2) + (LANG === "vi" ? " triệu" : "M");
  if (a >= 1e4) return fmt(v / 1e3, 1) + "k";
  return fmt(v, 0);
}
/* Hour index (Hour 1 = 1 Jan 00:00) -> date label */
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function hourToDate(hh) {
  let x = hh - 1; if (!isFinite(x)) return null;
  const yearH = 8760; let year = 0;
  while (x >= yearH) { x -= yearH; year++; }
  while (x < 0) { x += yearH; year--; }
  let day = Math.floor(x / 24); const hr = x - day * 24; let m = 0;
  while (m < 11 && day >= MDAYS[m]) { day -= MDAYS[m]; m++; }
  return { year, month: m, day: day + 1, hour: Math.floor(hr), minute: Math.floor((hr % 1) * 60) };
}
const pad = n => String(n).padStart(2, "0");
function fmtDate(hh, withTime = true) {
  const d = hourToDate(hh); if (!d) return "–";
  const yr = d.year ? ` (+${d.year})` : "";
  return `${pad(d.day)}/${pad(d.month + 1)}${withTime ? " " + pad(d.hour) + ":" + pad(d.minute) : ""}${yr}`;
}
const MONTHS = { vi: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };

function toast(msg, isErr) {
  const el = $("#toast");
  el.textContent = msg; el.className = "toast show" + (isErr ? " err" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.className = "toast", isErr ? 5000 : 2600);
}
function download(url) { const a = h("a", { href: url, download: "" }); document.body.appendChild(a); a.click(); a.remove(); }
async function downloadPost(url, body, filename) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  const blob = await r.blob();
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const API_BASE = "https://ose-portsimulation-backend.onrender.com";

function apiUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + "/" + url.replace(/^\/+/, "");
}

const API = {
  async get(url) {
    const r = await fetch(apiUrl(url));
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j });
    return j;
  },

  async post(url, body) {
    const r = await fetch(apiUrl(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j });
    return j;
  },

  async del(url) {
    const r = await fetch(apiUrl(url), { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { data: j });
    return j;
  },

  async upload(url, files, base) {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (base) fd.append("base", JSON.stringify(base));

    const r = await fetch(apiUrl(url), {
      method: "POST",
      body: fd
    });

    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  },
};

const store = {
  get(k, d) { try { const v = localStorage.getItem("psim." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("psim." + k, JSON.stringify(v)); } catch (e) { /* quota / private mode */ } },
};

/* Tooltip */
const TT = {
  show(html, x, y) {
    const el = $("#tooltip"); el.innerHTML = html; el.style.display = "block";
    const r = el.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    el.style.left = Math.max(4, left) + "px"; el.style.top = Math.max(4, top) + "px";
  },
  hide() { $("#tooltip").style.display = "none"; },
};

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* Colour system */
const COLORS = {
  cat: ["#2E86AB", "#E4572E", "#3BB273", "#7A5195", "#F2A541", "#17BEBB", "#D1495B", "#8C6D46", "#5C6BC0", "#76B041"],
  wait: {
    WaitBerth_h: "#E4572E", WaitTideIn_h: "#2E86AB", WaitWeatherIn_h: "#7A5195", WaitDaylightIn_h: "#F2A541", WaitChannelIn_h: "#3BB273",
    HandlingDowntime_h: "#9C6644",
    WaitTideOut_h: "#7FB7D3", WaitWeatherOut_h: "#B39BC8", WaitDaylightOut_h: "#F7CC8A", WaitChannelOut_h: "#8FD3A6",
  },
  cause: { berth: "#E4572E", tide: "#2E86AB", weather: "#7A5195", day: "#F2A541", channel: "#3BB273", down: "#9C6644" },
};
function catColor(i) { return COLORS.cat[i % COLORS.cat.length]; }
