/* Minimal dependency-free SVG charts: bar (grouped/stacked/horizontal), line/area (zoomable), donut. */
const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };

  function nice(min, max, n = 5) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (max === min) { max = min + (min === 0 ? 1 : Math.abs(min) * 0.5); }
    const span = max - min;
    const step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const r = step0 / mag;
    const step = (r > 5 ? 10 : r > 2 ? 5 : r > 1 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const ticks = []; for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
    return { lo, hi, ticks, step };
  }
  const defFmt = v => Math.abs(v) >= 1e4 ? fmtBig(v) : fmt(v, Math.abs(v) < 10 && v % 1 ? 1 : 0);

  const registry = new Map();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(entries => {
    for (const en of entries) {
      const r = registry.get(en.target); if (!r) continue;
      const w = Math.round(en.contentRect.width);
      if (w && w !== r.w) { r.w = w; r.fn(); }
    }
  }) : null;
  function register(el, fn) {
    if (!registry.has(el) && ro) ro.observe(el);
    registry.set(el, { fn, w: el.clientWidth });
  }
  function redrawAll() { for (const [el, r] of registry) { if (document.body.contains(el)) r.fn(); else { registry.delete(el); ro && ro.unobserve(el); } } }

  function frame(el, height) {
    el.innerHTML = "";
    el.classList.add("chart");
    const W = Math.max(200, el.clientWidth || 600);
    const svg = s("svg", { width: W, height, viewBox: `0 0 ${W} ${height}` });
    el.appendChild(svg);
    return { svg, W };
  }
  function legend(el, series, hidden, redraw) {
    if (series.length < 2) return;
    const lg = h("div", { class: "legend" });
    series.forEach((se, i) => {
      const sp = h("span", { class: hidden.has(i) ? "off" : "" }, h("i", { style: { background: se.color } }), se.name);
      sp.onclick = () => { hidden.has(i) ? hidden.delete(i) : hidden.add(i); redraw(); };
      lg.appendChild(sp);
    });
    el.appendChild(lg);
  }
  function empty(el, height) { el.innerHTML = ""; el.classList.add("chart"); el.appendChild(h("div", { class: "empty", style: { height: height + "px" } }, t("common.noData"))); }
  function ttHtml(title, rows) {
    return `<div class="tt-title">${esc(title)}</div>` + rows.map(r => `<div class="tt-row"><span><i style="background:${r.color}"></i>${esc(r.name)}</span><b>${esc(r.value)}</b></div>`).join("");
  }

  /* ------------------------------------------------------------ BAR */
  function bar(el, opt) {
    el._hidden = el._hidden || new Set();
    const draw = () => {
      const H = opt.height || 260;
      const cats = opt.categories || [];
      const series = (opt.series || []).map((x, i) => ({ ...x, color: x.color || catColor(i) }));
      if (!cats.length || !series.length) return empty(el, H);
      const vis = series.filter((_, i) => !el._hidden.has(i));
      const { svg, W } = frame(el, H);
      const f = opt.fmt || defFmt;
      const horiz = !!opt.horizontal;
      let vmax = 0, vmin = 0;
      cats.forEach((_, ci) => {
        if (opt.stacked) { let sp = 0, sn = 0; vis.forEach(se => { const v = se.data[ci] || 0; v >= 0 ? sp += v : sn += v; }); vmax = Math.max(vmax, sp); vmin = Math.min(vmin, sn); }
        else vis.forEach(se => { const v = se.data[ci] || 0; vmax = Math.max(vmax, v); vmin = Math.min(vmin, v); });
      });
      (opt.refs || []).forEach(r => { const vals = r.values || [r.value]; vals.forEach(v => { if (v != null) vmax = Math.max(vmax, v); }); });
      if (opt.max) vmax = Math.max(vmax, opt.max);
      const sc = nice(vmin, vmax * 1.05);
      const labW = horiz ? Math.min(180, Math.max(...cats.map(c => String(c).length)) * 6.6 + 12) : Math.max(...sc.ticks.map(v => f(v).length)) * 6.6 + 14;
      const m = { l: labW + (opt.yTitle && !horiz ? 14 : 0), r: 14, t: 10, b: horiz ? 26 : (opt.rotate ? 78 : cats.length > 8 ? 52 : 30) };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const g = s("g", { transform: `translate(${m.l},${m.t})` }); svg.appendChild(g);
      const val2px = v => horiz ? (v - sc.lo) / (sc.hi - sc.lo) * pw : ph - (v - sc.lo) / (sc.hi - sc.lo) * ph;
      // grid + value axis
      const ax = s("g", { class: "axis" }); g.appendChild(ax);
      sc.ticks.forEach(v => {
        const p = val2px(v);
        if (horiz) { ax.appendChild(s("line", { x1: p, x2: p, y1: 0, y2: ph, class: "grid-line" })); const tx = s("text", { x: p, y: ph + 16, "text-anchor": "middle" }); tx.textContent = f(v); ax.appendChild(tx); }
        else { ax.appendChild(s("line", { x1: 0, x2: pw, y1: p, y2: p, class: "grid-line" })); const tx = s("text", { x: -6, y: p + 4, "text-anchor": "end" }); tx.textContent = f(v); ax.appendChild(tx); }
      });
      if (opt.yTitle && !horiz) { const tt = s("text", { class: "title-y", transform: `translate(${-m.l + 11},${ph / 2}) rotate(-90)`, "text-anchor": "middle" }); tt.textContent = opt.yTitle; g.appendChild(tt); }
      const band = (horiz ? ph : pw) / cats.length;
      const inner = band * (opt.barWidth || 0.72);
      const nS = opt.stacked ? 1 : vis.length;
      const bw = inner / nS;
      const zero = val2px(0);
      cats.forEach((c, ci) => {
        const b0 = ci * band + (band - inner) / 2;
        let accP = 0, accN = 0;
        vis.forEach((se, si) => {
          const v = se.data[ci] || 0;
          let a, bpx;
          if (opt.stacked) { const base = v >= 0 ? accP : accN; a = val2px(base); bpx = val2px(base + v); v >= 0 ? accP += v : accN += v; }
          else { a = zero; bpx = val2px(v); }
          const off = opt.stacked ? 0 : si * bw;
          const r = horiz
            ? s("rect", { x: Math.min(a, bpx), y: b0 + off, width: Math.abs(bpx - a), height: Math.max(1, bw - 1), fill: se.colors ? se.colors[ci] : se.color, rx: 2, "pointer-events": "none" })
            : s("rect", { x: b0 + off, y: Math.min(a, bpx), width: Math.max(1, bw - 1), height: Math.abs(bpx - a), fill: se.colors ? se.colors[ci] : se.color, rx: 2, "pointer-events": "none" });
          g.appendChild(r);
          if (opt.valueLabels && !opt.stacked && Math.abs(v) > 0) {
            const tx = horiz ? s("text", { x: bpx + 4, y: b0 + off + bw / 2 + 4, "font-size": 11, fill: cssVar("--ink-2") })
              : s("text", { x: b0 + off + bw / 2, y: bpx - 4, "text-anchor": "middle", "font-size": 11, fill: cssVar("--ink-2") });
            tx.textContent = f(v); g.appendChild(tx);
          }
        });
        if (opt.stacked && opt.valueLabels) {
          const tot = accP; const p = val2px(tot);
          const tx = horiz ? s("text", { x: p + 4, y: b0 + inner / 2 + 4, "font-size": 11, fill: cssVar("--ink-2") })
            : s("text", { x: b0 + inner / 2, y: p - 4, "text-anchor": "middle", "font-size": 11, fill: cssVar("--ink-2") });
          tx.textContent = f(tot); g.appendChild(tx);
        }
        // category label
        const lab = String(c);
        if (horiz) { const tx = s("text", { x: -8, y: b0 + inner / 2 + 4, "text-anchor": "end" }); tx.textContent = lab.length > 26 ? lab.slice(0, 25) + "…" : lab; ax.appendChild(tx); }
        else if (!opt.skipLabels || ci % opt.skipLabels === 0) {
          const rot = cats.length > 8 || opt.rotate;
          const tx = s("text", rot ? { transform: `translate(${b0 + inner / 2},${ph + 12}) rotate(-35)`, "text-anchor": "end" } : { x: b0 + inner / 2, y: ph + 18, "text-anchor": "middle" });
          tx.textContent = lab.length > 18 ? lab.slice(0, 17) + "…" : lab; ax.appendChild(tx);
        }
        // hover band
        const hb = horiz ? s("rect", { x: 0, y: ci * band, width: pw, height: band, fill: "transparent" }) : s("rect", { x: ci * band, y: 0, width: band, height: ph, fill: "transparent" });
        hb.addEventListener("mousemove", e => {
          const rows = vis.map(se => ({ name: se.name, color: se.colors ? se.colors[ci] : se.color, value: (opt.tipFmt || f)(se.data[ci] || 0) }));
          if (opt.stacked && vis.length > 1) rows.push({ name: "Σ", color: "transparent", value: (opt.tipFmt || f)(vis.reduce((a, se) => a + (se.data[ci] || 0), 0)) });
          (opt.refs || []).forEach(r => { const v = r.values ? r.values[ci] : r.value; if (v != null) rows.push({ name: r.label, color: r.color, value: (opt.tipFmt || f)(v) }); });
          TT.show(ttHtml(opt.tipTitle ? opt.tipTitle(ci) : c, rows), e.clientX, e.clientY);
          hb.setAttribute("fill", cssVar("--line-2")); hb.setAttribute("fill-opacity", ".5");
        });
        hb.addEventListener("mouseleave", () => { TT.hide(); hb.setAttribute("fill", "transparent"); });
        g.insertBefore(hb, g.firstChild.nextSibling);
      });
      // reference lines (global value or per-category markers)
      (opt.refs || []).forEach(r => {
        if (r.values) {
          r.values.forEach((v, ci) => {
            if (v == null) return;
            const b0 = ci * band + (band - inner) / 2 - 3, p = val2px(v);
            g.appendChild(horiz ? s("line", { x1: p, x2: p, y1: b0, y2: b0 + inner + 6, stroke: r.color, "stroke-width": 2.5, "stroke-dasharray": r.dash || "" })
              : s("line", { x1: b0, x2: b0 + inner + 6, y1: p, y2: p, stroke: r.color, "stroke-width": 2.5, "stroke-dasharray": r.dash || "" }));
          });
        } else {
          const p = val2px(r.value);
          g.appendChild(horiz ? s("line", { x1: p, x2: p, y1: 0, y2: ph, stroke: r.color, "stroke-width": 1.5, "stroke-dasharray": r.dash || "5 4" })
            : s("line", { x1: 0, x2: pw, y1: p, y2: p, stroke: r.color, "stroke-width": 1.5, "stroke-dasharray": r.dash || "5 4" }));
          if (r.label) { const tx = s("text", { x: horiz ? p + 4 : pw - 4, y: horiz ? 10 : p - 5, "text-anchor": horiz ? "start" : "end", "font-size": 11, fill: r.color }); tx.textContent = r.label; g.appendChild(tx); }
        }
      });
      g.appendChild(s("line", horiz ? { x1: zero, x2: zero, y1: 0, y2: ph, stroke: cssVar("--ink-3") } : { x1: 0, x2: pw, y1: zero, y2: zero, stroke: cssVar("--ink-3") }));
      const legendSeries = series.concat((opt.refs || []).filter(r => r.label && r.values).map(r => ({ name: r.label, color: r.color, ref: true })));
      if (opt.legend !== false) legend(el, series, el._hidden, draw);
      if (opt.legend !== false && legendSeries.length > series.length) {
        const lg = el.querySelector(".legend") || el.appendChild(h("div", { class: "legend" }));
        legendSeries.filter(x => x.ref).forEach(r => lg.appendChild(h("span", {}, h("i", { style: { background: r.color, height: "3px" } }), r.name)));
      }
    };
    register(el, draw); draw();
  }

  /* ------------------------------------------------------------ LINE / AREA */
  function line(el, opt) {
    el._hidden = el._hidden || new Set();
    el._xr = opt.keepZoom ? el._xr : null;
    const draw = () => {
      const H = opt.height || 260;
      const X = opt.x || [];
      const series = (opt.series || []).map((x, i) => ({ ...x, color: x.color || catColor(i) }));
      if (!X.length || !series.length) return empty(el, H);
      const { svg, W } = frame(el, H);
      const f = opt.fmt || defFmt;
      const xf = opt.xFmt || (v => fmt(v, 0));
      const vis = series.map((se, i) => ({ se, i })).filter(o => !el._hidden.has(o.i));
      // x range
      let x0 = X[0], x1 = X[X.length - 1];
      if (el._xr) { x0 = el._xr[0]; x1 = el._xr[1]; }
      let i0 = 0, i1 = X.length - 1;
      while (i0 < X.length - 1 && X[i0] < x0) i0++;
      while (i1 > 0 && X[i1] > x1) i1--;
      if (i1 <= i0) { i0 = 0; i1 = X.length - 1; el._xr = null; x0 = X[0]; x1 = X[X.length - 1]; }
      // stacked cumulative
      const stack = !!opt.stacked;
      let cum = null;
      if (stack) {
        cum = vis.map(() => new Float64Array(i1 - i0 + 1));
        for (let k = i0; k <= i1; k++) { let acc = 0; vis.forEach((o, j) => { acc += o.se.data[k] || 0; cum[j][k - i0] = acc; }); }
      }
      let ymin = opt.yMin != null ? opt.yMin : Infinity, ymax = -Infinity;
      if (stack) { for (let k = 0; k <= i1 - i0; k++) ymax = Math.max(ymax, cum[cum.length - 1][k]); ymin = Math.min(ymin, 0); }
      else vis.forEach(o => { for (let k = i0; k <= i1; k++) { const v = o.se.data[k]; if (v == null) continue; if (v < ymin) ymin = v; if (v > ymax) ymax = v; } });
      (opt.refs || []).forEach(r => { ymax = Math.max(ymax, r.value); ymin = Math.min(ymin, r.value); });
      if (!isFinite(ymin)) ymin = 0; if (!isFinite(ymax)) ymax = 1;
      const pad = (ymax - ymin) * 0.06;
      const sc = nice(opt.yMin != null ? opt.yMin : ymin - (ymin < 0 ? pad : 0), ymax + pad, opt.yTicks || 4);
      const labW = Math.max(...sc.ticks.map(v => f(v).length)) * 6.6 + 14;
      const m = { l: labW + (opt.yTitle ? 14 : 0), r: 12, t: 10, b: 26 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const g = s("g", { transform: `translate(${m.l},${m.t})` }); svg.appendChild(g);
      const xp = v => (v - x0) / ((x1 - x0) || 1) * pw;
      const yp = v => ph - (v - sc.lo) / (sc.hi - sc.lo) * ph;
      const ax = s("g", { class: "axis" }); g.appendChild(ax);
      sc.ticks.forEach(v => { const p = yp(v); ax.appendChild(s("line", { x1: 0, x2: pw, y1: p, y2: p, class: "grid-line" })); const tx = s("text", { x: -6, y: p + 4, "text-anchor": "end" }); tx.textContent = f(v); ax.appendChild(tx); });
      if (opt.yTitle) { const tt = s("text", { class: "title-y", transform: `translate(${-m.l + 11},${ph / 2}) rotate(-90)`, "text-anchor": "middle" }); tt.textContent = opt.yTitle; g.appendChild(tt); }
      // x ticks
      const xticks = opt.xTicks ? opt.xTicks(x0, x1, pw) : nice(x0, x1, Math.max(2, Math.floor(pw / 90))).ticks.filter(v => v >= x0 && v <= x1);
      xticks.forEach(v => { const p = xp(v); ax.appendChild(s("line", { x1: p, x2: p, y1: ph, y2: ph + 4 })); const tx = s("text", { x: p, y: ph + 17, "text-anchor": "middle" }); tx.textContent = xf(v); ax.appendChild(tx); });
      ax.appendChild(s("line", { x1: 0, x2: pw, y1: ph, y2: ph }));
      // bands (e.g. weather closures)
      (opt.bands || []).forEach(b => {
        const d = b.data; let st = null;
        const path = [];
        for (let k = i0; k <= i1 + 1; k++) {
          const on = k <= i1 && d[k];
          if (on && st === null) st = k;
          if (!on && st !== null) { path.push([X[st], X[Math.min(k, i1)]]); st = null; }
        }
        path.forEach(([a, bb]) => g.appendChild(s("rect", { x: xp(a), y: 0, width: Math.max(1, xp(bb) - xp(a)), height: ph, fill: b.color, "fill-opacity": b.opacity || .12 })));
      });
      // downsample
      const n = i1 - i0 + 1;
      const buckets = Math.max(1, Math.floor(pw));
      const per = n / buckets;
      const pathFor = (getter) => {
        let d = "";
        if (n <= buckets * 2) {
          for (let k = i0; k <= i1; k++) { const v = getter(k); if (v == null) continue; d += (d ? "L" : "M") + xp(X[k]).toFixed(1) + "," + yp(v).toFixed(1); }
        } else {
          for (let b = 0; b < buckets; b++) {
            const a = i0 + Math.floor(b * per), z = Math.min(i1, i0 + Math.floor((b + 1) * per) - 1);
            let mn = Infinity, mx = -Infinity, kmn = a, kmx = a;
            for (let k = a; k <= z; k++) { const v = getter(k); if (v == null) continue; if (v < mn) { mn = v; kmn = k; } if (v > mx) { mx = v; kmx = k; } }
            if (!isFinite(mn)) continue;
            const pts = kmn < kmx ? [[kmn, mn], [kmx, mx]] : [[kmx, mx], [kmn, mn]];
            pts.forEach(([k, v]) => { d += (d ? "L" : "M") + xp(X[k]).toFixed(1) + "," + yp(v).toFixed(1); });
          }
        }
        return d;
      };
      if (stack) {
        for (let j = vis.length - 1; j >= 0; j--) {
          const top = pathFor(k => cum[j][k - i0]);
          const area = top + `L${xp(X[i1]).toFixed(1)},${yp(0)}L${xp(X[i0]).toFixed(1)},${yp(0)}Z`;
          g.appendChild(s("path", { d: area, fill: vis[j].se.color, "fill-opacity": .85, stroke: "none" }));
        }
      } else {
        vis.forEach(o => {
          const d = pathFor(k => o.se.data[k]);
          if (o.se.area) g.appendChild(s("path", { d: d + `L${xp(X[i1]).toFixed(1)},${yp(Math.max(sc.lo, 0))}L${xp(X[i0]).toFixed(1)},${yp(Math.max(sc.lo, 0))}Z`, fill: o.se.color, "fill-opacity": .15 }));
          g.appendChild(s("path", { d, fill: "none", stroke: o.se.color, "stroke-width": o.se.width || 1.4, "stroke-dasharray": o.se.dash || "" }));
        });
      }
      (opt.refs || []).forEach(r => {
        const p = yp(r.value);
        g.appendChild(s("line", { x1: 0, x2: pw, y1: p, y2: p, stroke: r.color, "stroke-width": 1.4, "stroke-dasharray": r.dash || "6 4" }));
        if (r.label) { const tx = s("text", { x: pw - 4, y: p - 5, "text-anchor": "end", "font-size": 11, fill: r.color }); tx.textContent = r.label; g.appendChild(tx); }
      });
      // interaction: hover + brush zoom
      const guide = s("line", { y1: 0, y2: ph, stroke: cssVar("--ink-3"), "stroke-dasharray": "3 3", visibility: "hidden" }); g.appendChild(guide);
      const brush = s("rect", { class: "brush", y: 0, height: ph, visibility: "hidden" }); g.appendChild(brush);
      const ov = s("rect", { x: 0, y: 0, width: pw, height: ph, fill: "transparent", style: "cursor:crosshair" }); g.appendChild(ov);
      const px2x = px => x0 + px / pw * (x1 - x0);
      const idxAt = xv => { let lo = i0, hi = i1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; X[mid] < xv ? lo = mid : hi = mid; } return (xv - X[lo] < X[hi] - xv) ? lo : hi; };
      let drag = null;
      ov.addEventListener("mousedown", e => { if (opt.zoom === false) return; const r = ov.getBoundingClientRect(); drag = e.clientX - r.left; });
      ov.addEventListener("mousemove", e => {
        const r = ov.getBoundingClientRect(); const px = Math.max(0, Math.min(pw, e.clientX - r.left));
        if (drag !== null) { brush.setAttribute("visibility", "visible"); brush.setAttribute("x", Math.min(drag, px)); brush.setAttribute("width", Math.abs(px - drag)); TT.hide(); return; }
        const k = idxAt(px2x(px));
        guide.setAttribute("x1", xp(X[k])); guide.setAttribute("x2", xp(X[k])); guide.setAttribute("visibility", "visible");
        const rows = vis.map(o => ({ name: o.se.name, color: o.se.color, value: f(o.se.data[k] ?? 0) }));
        if (stack && vis.length > 1) rows.push({ name: "Σ", color: "transparent", value: f(vis.reduce((a, o) => a + (o.se.data[k] || 0), 0)) });
        TT.show(ttHtml(opt.tipTitle ? opt.tipTitle(X[k]) : xf(X[k]), rows), e.clientX, e.clientY);
      });
      const end = e => {
        if (drag === null) return;
        const r = ov.getBoundingClientRect(); const px = Math.max(0, Math.min(pw, e.clientX - r.left));
        const a = Math.min(drag, px), b = Math.max(drag, px); drag = null; brush.setAttribute("visibility", "hidden");
        if (b - a > 6) { el._xr = [px2x(a), px2x(b)]; draw(); opt.onZoom && opt.onZoom(el._xr); }
      };
      ov.addEventListener("mouseup", end);
      ov.addEventListener("mouseleave", e => { TT.hide(); guide.setAttribute("visibility", "hidden"); if (drag !== null) end(e); });
      ov.addEventListener("dblclick", () => { el._xr = null; draw(); opt.onZoom && opt.onZoom(null); });
      if (opt.legend !== false) legend(el, series, el._hidden, draw);
    };
    register(el, draw); draw();
    return { setRange(r) { el._xr = r; draw(); } };
  }

  /* ------------------------------------------------------------ DONUT */
  function donut(el, opt) {
    const draw = () => {
      const H = opt.height || 240;
      const items = (opt.items || []).filter(x => x.value > 0);
      const tot = items.reduce((a, b) => a + b.value, 0);
      if (!tot) return empty(el, H);
      const { svg, W } = frame(el, H);
      const R = Math.min(H / 2 - 8, W / 4.2), r0 = R * .6;
      const cx = Math.min(W / 2, R + 20), cy = H / 2;
      let a = -Math.PI / 2;
      items.forEach((it) => {
        const a2 = a + it.value / tot * Math.PI * 2;
        const large = a2 - a > Math.PI ? 1 : 0;
        const p = (ang, rr) => [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)];
        const [x1, y1] = p(a, R), [x2, y2] = p(a2, R), [x3, y3] = p(a2, r0), [x4, y4] = p(a, r0);
        const d = items.length === 1
          ? `M${cx - R},${cy}A${R},${R} 0 1 1 ${cx + R},${cy}A${R},${R} 0 1 1 ${cx - R},${cy}M${cx - r0},${cy}A${r0},${r0} 0 1 0 ${cx + r0},${cy}A${r0},${r0} 0 1 0 ${cx - r0},${cy}Z`
          : `M${x1},${y1}A${R},${R} 0 ${large} 1 ${x2},${y2}L${x3},${y3}A${r0},${r0} 0 ${large} 0 ${x4},${y4}Z`;
        const path = s("path", { d, fill: it.color, stroke: cssVar("--panel"), "stroke-width": 1.5, "fill-rule": "evenodd" });
        path.addEventListener("mousemove", e => TT.show(ttHtml(it.name, [{ name: "", color: it.color, value: (opt.fmt || defFmt)(it.value) + ` (${fmt(100 * it.value / tot, 1)}%)` }]), e.clientX, e.clientY));
        path.addEventListener("mouseleave", TT.hide);
        svg.appendChild(path);
        a = a2;
      });
      if (opt.center) {
        const t1 = s("text", { x: cx, y: cy - 2, "text-anchor": "middle", "font-size": 20, "font-weight": 650, fill: cssVar("--ink") }); t1.textContent = opt.center[0]; svg.appendChild(t1);
        const t2 = s("text", { x: cx, y: cy + 16, "text-anchor": "middle", "font-size": 11, fill: cssVar("--ink-3") }); t2.textContent = opt.center[1]; svg.appendChild(t2);
      }
      // side legend
      const lx = cx + R + 24;
      if (lx < W - 60) {
        items.forEach((it, i) => {
          const y = cy - items.length * 10 + i * 20 + 4;
          svg.appendChild(s("rect", { x: lx, y: y - 9, width: 10, height: 10, rx: 2, fill: it.color }));
          const tx = s("text", { x: lx + 16, y, "font-size": 12, fill: cssVar("--ink-2") });
          tx.textContent = `${it.name} · ${fmt(100 * it.value / tot, 1)}%`; svg.appendChild(tx);
        });
      }
    };
    register(el, draw); draw();
  }

  return { bar, line, donut, nice, redrawAll };
})();
