/* Berth occupancy Gantt chart on canvas */
const Gantt = (() => {
  const PRE = ["WaitBerth_h", "WaitTideIn_h", "WaitWeatherIn_h", "WaitDaylightIn_h", "WaitChannelIn_h"];

  function waitColor(w) {
    const x = Math.max(0, Math.min(1, w / 48));
    const stops = [[46, 158, 91], [242, 165, 65], [200, 65, 58]];
    const seg = x < .5 ? 0 : 1, f = x < .5 ? x * 2 : (x - .5) * 2;
    const c = stops[seg].map((v, i) => Math.round(v + (stops[seg + 1][i] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function create(container, cfg) {
    container.innerHTML = "";
    const wrap = h("div", { class: "canvas-wrap" });
    const cv = h("canvas");
    wrap.appendChild(cv); container.appendChild(wrap);
    const ctx = cv.getContext("2d");
    const LEFT = 132, TOP = 44, ROW = 24, GAP = 10;
    const rows = [];
    cfg.terminals.forEach((t, ti) => { for (let b = 0; b < t.BerthCount; b++) rows.push({ ti, b, term: t }); });
    const termIndex = {}; cfg.terminals.forEach((t, i) => termIndex[t.TerminalID] = i);
    const rowOf = {}; let y = TOP;
    const termY = [];
    cfg.terminals.forEach((t, ti) => {
      termY.push(y);
      for (let b = 0; b < t.BerthCount; b++) { rowOf[ti + ":" + b] = y; y += ROW; }
      y += GAP;
    });
    const H = y + 6;
    const ships = cfg.ships.filter(s => s.BerthSlot && s.BerthAssigned_h != null);
    const tMin = cfg.tStart, tMax = Math.max(cfg.tEnd, ...ships.map(s => s.StartChannelOut_h || s.EndService_h || 0));
    let v0 = cfg.range ? cfg.range[0] : tMin, v1 = cfg.range ? cfg.range[1] : Math.min(tMax, tMin + 24 * 30);
    let colorBy = "type";
    const env = cfg.env; // hourly arrays aligned at t0
    const bad = env.hs.map((hs, i) => hs > cfg.limits.hs || env.wind[i] > cfg.limits.wind);
    let W = 800, hover = null;

    function segs(s) {
      const A = Math.max(s.EndChannelIn_h ?? s.BerthAssigned_h, s.BerthAssigned_h);
      const out = [];
      if (s.BerthAssigned_h < A) out.push(["res", s.BerthAssigned_h, A]);
      if (s.StartService_h != null) out.push(["brt", A, s.StartService_h]);
      if (s.StartService_h != null) out.push(["svc", s.StartService_h, s.EndService_h ?? cfg.tEnd + 720]);
      if (s.EndService_h != null && s.ReadyToSail_h != null) out.push(["brt", s.EndService_h, s.ReadyToSail_h]);
      if (s.ReadyToSail_h != null) out.push(["wo", s.ReadyToSail_h, s.StartChannelOut_h ?? cfg.tEnd + 720]);
      return out;
    }
    const X = tt => LEFT + (tt - v0) / (v1 - v0) * (W - LEFT - 10);
    const T = px => v0 + (px - LEFT) / (W - LEFT - 10) * (v1 - v0);

    function hatch(color) {
      const p = document.createElement("canvas"); p.width = p.height = 6;
      const c = p.getContext("2d"); c.strokeStyle = color; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, 6); c.lineTo(6, 0); c.stroke();
      return ctx.createPattern(p, "repeat");
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      W = wrap.clientWidth || 900;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ink = cssVar("--ink"), ink3 = cssVar("--ink-3"), line = cssVar("--line"), panel = cssVar("--panel"), panel2 = cssVar("--panel-2");
      ctx.fillStyle = panel; ctx.fillRect(0, 0, W, H);
      // weather band
      const i0 = Math.max(0, Math.floor(v0 - cfg.t0)), i1 = Math.min(bad.length - 1, Math.ceil(v1 - cfg.t0));
      ctx.fillStyle = "rgba(200,65,58,0.10)";
      for (let i = i0; i <= i1; i++) if (bad[i]) { const a = X(cfg.t0 + i), b = X(cfg.t0 + i + 1); ctx.fillRect(a, TOP - 8, Math.max(1, b - a), H - TOP + 2); }
      ctx.fillStyle = "rgba(200,65,58,0.55)";
      for (let i = i0; i <= i1; i++) if (bad[i]) { const a = X(cfg.t0 + i), b = X(cfg.t0 + i + 1); ctx.fillRect(a, TOP - 8, Math.max(1, b - a), 5); }
      // rows
      rows.forEach((r, k) => {
        const yy = rowOf[r.ti + ":" + r.b];
        ctx.fillStyle = k % 2 ? panel : panel2; ctx.fillRect(LEFT, yy, W - LEFT, ROW);
      });
      // time axis
      const span = v1 - v0;
      const stepH = span <= 72 ? 6 : span <= 24 * 10 ? 24 : span <= 24 * 60 ? 24 * 7 : 24 * 30.4;
      ctx.font = "11px system-ui, sans-serif"; ctx.textAlign = "center";
      let first = Math.ceil((v0 - 1) / stepH) * stepH + 1;
      if (stepH > 24 * 30) { // month starts
        const starts = [1]; let acc = 1; for (let m = 0; m < 12 * 3; m++) { acc += MDAYS[m % 12] * 24; starts.push(acc); }
        starts.filter(x => x >= v0 && x <= v1).forEach(x => tick(x, MONTHS[LANG][hourToDate(x).month]));
      } else {
        for (let x = first; x <= v1; x += stepH) tick(x, stepH < 24 ? fmtDate(x) : fmtDate(x, false));
      }
      function tick(x, label) {
        const px = X(x); if (px < LEFT + 24) return; ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(px, TOP - 12); ctx.lineTo(px, H); ctx.stroke();
        ctx.fillStyle = ink3; ctx.fillText(label, px, 16);
      }
      // bars
      const resPat = hatch("rgba(120,130,140,.7)"), woPat = hatch("rgba(200,65,58,.8)");
      ships.forEach(s => {
        const ti = termIndex[s.TerminalID]; if (ti === undefined) return;
        const yy = rowOf[ti + ":" + (s.BerthSlot - 1)]; if (yy === undefined) return;
        const base = colorBy === "type" ? (cfg.typeColors[s.ShipTypeName] || "#888") : waitColor(PRE.reduce((a, k) => a + (s[k] || 0), 0));
        segs(s).forEach(([kind, a, b]) => {
          if (b < v0 || a > v1) return;
          const xa = Math.max(LEFT, X(a)), xb = Math.min(W - 10, X(b));
          if (xb <= xa) return;
          if (kind === "res") { ctx.fillStyle = resPat; ctx.fillRect(xa, yy + 5, xb - xa, ROW - 10); }
          else if (kind === "wo") { ctx.fillStyle = woPat; ctx.fillRect(xa, yy + 4, xb - xa, ROW - 8); }
          else { ctx.globalAlpha = kind === "brt" ? .5 : 1; ctx.fillStyle = base; ctx.fillRect(xa, yy + 3, xb - xa, ROW - 6); ctx.globalAlpha = 1; }
        });
        if (hover === s) {
          const a = X(s.BerthAssigned_h), b = X(s.StartChannelOut_h ?? s.EndService_h);
          ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.strokeRect(a, yy + 1.5, b - a, ROW - 3); ctx.lineWidth = 1;
        }
        const xa = X(s.StartService_h ?? s.BerthAssigned_h), xb = X(s.EndService_h ?? s.StartService_h);
        if (xb - xa > 46 && s.StartService_h != null) {
          ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.font = "10.5px system-ui, sans-serif";
          ctx.save(); ctx.beginPath(); ctx.rect(xa, yy, xb - xa, ROW); ctx.clip();
          ctx.fillText(`#${s.CallID} ${s.ShipTypeName}`, xa + 4, yy + ROW / 2 + 4); ctx.restore();
        }
      });
      // left labels
      ctx.fillStyle = panel; ctx.fillRect(0, 0, LEFT - 1, H);
      ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(LEFT - .5, TOP - 12); ctx.lineTo(LEFT - .5, H); ctx.stroke();
      ctx.textAlign = "left";
      cfg.terminals.forEach((tm, ti) => {
        ctx.fillStyle = ink; ctx.font = "600 12px system-ui, sans-serif";
        const y0 = termY[ti];
        ctx.fillText(String(tm.TerminalName), 10, y0 + 16);
        ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = ink3;
        for (let b = 0; b < tm.BerthCount; b++) ctx.fillText(`${t("g.berth")} ${b + 1}`, 70, rowOf[ti + ":" + b] + 16);
      });
      ctx.fillStyle = ink3; ctx.font = "10.5px system-ui, sans-serif"; ctx.fillText(LANG === "vi" ? "⛈ Thời tiết" : "⛈ Weather", 10, TOP - 4);
    }

    // interaction
    let dragX = null, dragV = null;
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(); const px = e.clientX - r.left;
      if (px < LEFT) return;
      const tc = T(px), f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      let n0 = tc - (tc - v0) * f, n1 = tc + (v1 - tc) * f;
      if (n1 - n0 < 6) return;
      if (n1 - n0 > tMax - tMin + 48) { n0 = tMin; n1 = tMax; }
      v0 = n0; v1 = n1; draw();
    }, { passive: false });
    cv.addEventListener("mousedown", e => { dragX = e.clientX; dragV = [v0, v1]; cv.style.cursor = "grabbing"; });
    window.addEventListener("mouseup", () => { dragX = null; cv.style.cursor = ""; });
    cv.addEventListener("mousemove", e => {
      const r = cv.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
      if (dragX !== null) {
        const dt = (e.clientX - dragX) / (W - LEFT - 10) * (dragV[1] - dragV[0]);
        v0 = dragV[0] - dt; v1 = dragV[1] - dt; TT.hide(); draw(); return;
      }
      const tt = T(px);
      let found = null;
      for (const s of ships) {
        const ti = termIndex[s.TerminalID]; const yy = rowOf[ti + ":" + (s.BerthSlot - 1)];
        if (yy === undefined || py < yy || py > yy + ROW) continue;
        const end = s.StartChannelOut_h ?? s.EndService_h ?? Infinity;
        if (tt >= s.BerthAssigned_h && tt <= end) { found = s; break; }
      }
      if (found !== hover) { hover = found; draw(); }
      if (found) {
        const s = found;
        const pre = PRE.reduce((a, k) => a + (s[k] || 0), 0);
        const rows = [
          [t("common.shipType"), s.ShipTypeName], ["LOA / Draft", `${fmt(s.LOA_m, 0)} m / ${fmt(s.Draft_m, 1)} m`],
          ["ETA", fmtDate(s.ETA_h)], [t("g.reserved"), fmtDate(s.BerthAssigned_h)],
          [t("g.handling"), `${fmtDate(s.StartService_h)} → ${fmtDate(s.EndService_h)}`],
          [LANG === "vi" ? "Hàng / năng suất" : "Cargo / rate", `${fmtBig(s.Cargo_t)} t · ${fmt(s.Rate_tph, 0)} t/h · ${s.CranesAssigned} ${LANG === "vi" ? "cẩu" : "cranes"}`],
          [LANG === "vi" ? "Chờ trước bến" : "Pre-berth wait", fmt(pre, 1) + " h"], [t("wait.HandlingDowntime_h"), fmt(s.HandlingDowntime_h, 1) + " h"],
          [LANG === "vi" ? "Chờ rời bến" : "Wait to sail", fmt((s.WaitTideOut_h || 0) + (s.WaitWeatherOut_h || 0) + (s.WaitChannelOut_h || 0) + (s.WaitDaylightOut_h || 0), 1) + " h"],
          [LANG === "vi" ? "Quay vòng" : "Turnaround", s.Turnaround_h != null ? fmt(s.Turnaround_h, 1) + " h" : "–"],
        ];
        TT.show(`<div class="tt-title">#${s.CallID} · ${esc(cfg.terminals[termIndex[s.TerminalID]].TerminalName)} ${t("g.berth")} ${s.BerthSlot}</div>` +
          rows.map(r => `<div class="tt-row"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></div>`).join(""), e.clientX, e.clientY);
      } else TT.hide();
    });
    cv.addEventListener("mouseleave", () => { TT.hide(); if (hover) { hover = null; draw(); } });
    const ro = new ResizeObserver(() => draw()); ro.observe(wrap);
    draw();
    return {
      setRange(a, b) { v0 = a; v1 = b; draw(); },
      span(hrs) { if (!hrs) { v0 = tMin; v1 = tMax; } else { v1 = Math.min(tMax, v0 + hrs); v0 = v1 - hrs; } draw(); },
      setColorBy(c) { colorBy = c; draw(); },
      redraw: draw,
    };
  }
  return { create, waitColor };
})();
