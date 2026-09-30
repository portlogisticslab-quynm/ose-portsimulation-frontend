/* Port operations animation (canvas) */
const PortAnim = (() => {
  function create(canvasWrap, side, cfg) {
    const cv = h("canvas");
    canvasWrap.innerHTML = ""; canvasWrap.appendChild(cv);
    const ctx = cv.getContext("2d");
    const p = cfg.params;
    const terms = cfg.terminals;
    const ships = cfg.ships.filter(s => s.Status !== "Rejected" || String(s.Reason).startsWith("Balked"));
    const env = cfg.env, t0 = cfg.t0;
    const tStart = cfg.tStart, tEnd = cfg.tEnd;
    let tt = cfg.startAt || tStart, playing = false, speed = 6, last = null, W = 900, H = 540;
    const typeColors = cfg.typeColors;
    const envAt = (arr, x) => { const i = Math.max(0, Math.min(arr.length - 1, Math.floor(x - t0))); return arr[i]; };
    const waf = p["rules.waveAllowanceFactor"] || 0;

    function layout() {
      W = canvasWrap.clientWidth || 900;
      const nBerths = terms.reduce((a, t) => a + Math.max(1, t.BerthCount), 0);
      H = Math.max(440, Math.min(820, 120 + nBerths * 46 + terms.length * 18));
      const dpr = window.devicePixelRatio || 1;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const seaW = W * 0.24, basinX = W * 0.66, quayX = W * 0.80;
      const midY = H / 2;
      // terminals stacked along the quay
      const tl = []; let y = 40; const avail = H - 80;
      const unit = avail / nBerths;
      terms.forEach(t => { const n = Math.max(1, t.BerthCount); tl.push({ y0: y, y1: y + unit * n - 8, n }); y += unit * n; });
      return { seaW, basinX, quayX, midY, tl, chanX0: seaW, chanX1: basinX - 40, anchor: { x: seaW * 0.48, y: midY } };
    }
    let G = layout();

    function hull(x, y, len, wid, color, dir, alpha = 1) { // dir: 1 = heading right, -1 = left, 0 = vertical (alongside)
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
      if (dir === 0) ctx.rotate(Math.PI / 2); else if (dir < 0) ctx.rotate(Math.PI);
      ctx.beginPath();
      ctx.moveTo(-len / 2, -wid / 2); ctx.lineTo(len / 2 - wid * .8, -wid / 2); ctx.lineTo(len / 2, 0);
      ctx.lineTo(len / 2 - wid * .8, wid / 2); ctx.lineTo(-len / 2, wid / 2); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = .8; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(-len / 2 + 2, -wid / 4, Math.max(2, len * .14), wid / 2);
      ctx.restore();
    }
    const shipLen = s => Math.max(14, Math.min(46, s.LOA_m / 6));

    function stage(s) {
      if (tt < s.ETA_h) return null;
      const chin = s.StartChannelIn_h;
      if (chin == null || tt < chin) {
        if (s.Status === "Rejected") { const lim = p["policy.maxAnchorageWait_h"] || 0; if (tt > s.ETA_h + lim) return null; }
        if (s.Status === "NotCompleted" || s.Status === "Rejected" || chin != null) return { k: "anchor" };
        return { k: "anchor" };
      }
      if (tt < s.EndChannelIn_h) return { k: "in", f: (tt - chin) / (s.EndChannelIn_h - chin) };
      const A = Math.max(s.EndChannelIn_h, s.BerthAssigned_h ?? Infinity);
      if (tt < A) return { k: "basin" };
      const out = s.StartChannelOut_h ?? Infinity;
      if (tt < out) {
        let sub = "wo", prog = 1;
        if (s.StartService_h == null || tt < s.StartService_h) { sub = "brt"; prog = 0; }
        else if (s.EndService_h == null || tt < s.EndService_h) { sub = "svc"; prog = s.EndService_h ? (tt - s.StartService_h) / (s.EndService_h - s.StartService_h) : .5; }
        else if (s.ReadyToSail_h == null || tt < s.ReadyToSail_h) sub = "brt";
        return { k: "berth", sub, prog };
      }
      if (s.Departure_h != null && tt < s.Departure_h) return { k: "out", f: (tt - out) / (s.Departure_h - out) };
      if (s.Departure_h != null && tt < s.Departure_h + 1.5) return { k: "gone", f: (tt - s.Departure_h) / 1.5 };
      return null;
    }
    function anchorCause(s) {
      if (s.BerthAssigned_h == null || s.BerthAssigned_h > tt) return p["policy.berthBeforeChannel"] ? "berth" : "channel";
      const hs = envAt(env.hs, tt), wl = envAt(env.waterLevel, tt), wind = envAt(env.wind, tt);
      if (hs > p["rules.maxWaveForChannel_m"] || (p["rules.maxWindForChannel_ms"] > 0 && wind > p["rules.maxWindForChannel_ms"])) return "weather";
      if (p["channel.depth_m"] + wl - waf * hs < s.Draft_m + p["rules.minUKC_m"]) return "tide";
      if (p["rules.nightNavMaxLOA_m"] > 0 && s.LOA_m > p["rules.nightNavMaxLOA_m"]) {
        const tod = ((tt - 1) % 24 + 24) % 24; if (tod < p["rules.dayStartHour"] || tod >= p["rules.dayEndHour"]) return "day";
      }
      return "channel";
    }

    function drawScene() {
      const c = { sea: cssVar("--sea"), sea2: cssVar("--sea-2"), land: cssVar("--land"), quay: cssVar("--quay"), ink: cssVar("--ink"), ink3: cssVar("--ink-3"), panel: cssVar("--panel") };
      // sea everywhere
      ctx.fillStyle = c.sea; ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, G.seaW, 0); g.addColorStop(0, c.sea2); g.addColorStop(1, c.sea);
      ctx.fillStyle = g; ctx.fillRect(0, 0, G.seaW, H);
      // coast (land) with channel cut
      const chHalf = 26;
      ctx.fillStyle = c.land;
      ctx.beginPath(); ctx.moveTo(G.chanX0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(G.chanX0, H); ctx.lineTo(G.chanX0, G.midY + chHalf);
      ctx.lineTo(G.chanX1, G.midY + chHalf); ctx.lineTo(G.chanX1, G.midY - chHalf); ctx.lineTo(G.chanX0, G.midY - chHalf); ctx.closePath(); ctx.fill();
      // basin & harbour water
      ctx.fillStyle = c.sea;
      ctx.beginPath(); ctx.moveTo(G.chanX1, 24); ctx.lineTo(G.quayX, 24); ctx.lineTo(G.quayX, H - 24); ctx.lineTo(G.chanX1, H - 24); ctx.closePath(); ctx.fill();
      // channel
      ctx.fillStyle = c.sea2; ctx.fillRect(G.chanX0, G.midY - chHalf, G.chanX1 - G.chanX0 + 2, chHalf * 2);
      ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.moveTo(G.chanX0 - 60, G.midY); ctx.lineTo(G.chanX1, G.midY); ctx.stroke(); ctx.setLineDash([]);
      // buoys
      for (let x = G.chanX0 - 50; x < G.chanX1; x += 46) {
        ctx.fillStyle = "#D1495B"; ctx.beginPath(); ctx.arc(x, G.midY - chHalf - 3, 3, 0, 7); ctx.fill();
        ctx.fillStyle = "#3BB273"; ctx.beginPath(); ctx.arc(x, G.midY + chHalf + 3, 3, 0, 7); ctx.fill();
      }
      // turning basin circle
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.arc((G.chanX1 + G.quayX) / 2 - 20, G.midY, Math.min(90, (G.quayX - G.chanX1) / 2 - 10), 0, 7); ctx.stroke(); ctx.setLineDash([]);
      // anchorage zone
      ctx.strokeStyle = "rgba(10,60,90,.35)"; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(G.anchor.x, G.anchor.y, Math.min(G.seaW * 0.44, H * 0.4), 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "600 11px system-ui, sans-serif"; ctx.fillStyle = c.ink3; ctx.textAlign = "center";
      ctx.fillText("⚓ " + t("a.anchorage"), G.anchor.x, 18);
      ctx.fillText(`${t("a.channel")} · ${fmt(p["channel.length_m"] / 1000, 1)} km · ${p["channel.trafficMode"]}`, (G.chanX0 + G.chanX1) / 2, G.midY - chHalf - 12);
      ctx.fillText(t("a.basin"), (G.chanX1 + G.quayX) / 2 - 20, 40);
      // quay + terminals
      terms.forEach((tm, i) => {
        const L = G.tl[i];
        ctx.fillStyle = c.quay; ctx.fillRect(G.quayX, L.y0, 10, L.y1 - L.y0);
        ctx.fillStyle = c.ink; ctx.textAlign = "left"; ctx.font = "600 12px system-ui, sans-serif";
        ctx.fillText(String(tm.TerminalName), G.quayX + 18, L.y0 + 14);
        ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = c.ink3;
        ctx.fillText(`${tm.BerthCount} ${t("g.berth").toLowerCase()} · ${fmt(tm.BerthLength_m, 0)} m · ${tm.Cranes} ${LANG === "vi" ? "cẩu" : "cr."}`, G.quayX + 18, L.y0 + 29);
        for (let b = 0; b < L.n; b++) {
          const by = L.y0 + (b + .5) * (L.y1 - L.y0) / L.n;
          ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.strokeRect(G.quayX - 16, by - (L.y1 - L.y0) / L.n / 2 + 3, 14, (L.y1 - L.y0) / L.n - 6);
        }
      });
    }

    function render() {
      drawScene();
      const cnt = { anchor: 0, berth: 0, tide: 0, weather: 0, day: 0, channel: 0, inCh: 0, basin: 0, atBerth: 0, svc: 0, wo: 0 };
      const perTerm = terms.map(() => 0);
      const anchored = [];
      const hsNow = envAt(env.hs, tt), windNow = envAt(env.wind, tt);
      const handStop = hsNow > p["rules.maxWaveForHandling_m"] || windNow > p["rules.maxWindForHandling_ms"];
      for (const s of ships) {
        const st = stage(s); if (!st) continue;
        const col = typeColors[s.ShipTypeName] || "#888";
        const len = shipLen(s);
        if (st.k === "anchor") { anchored.push(s); continue; }
        if (st.k === "in") { cnt.inCh++; const x = G.chanX0 - 60 + (G.chanX1 - G.chanX0 + 80) * st.f; hull(x, G.midY - 12, len, 8, col, 1); }
        else if (st.k === "out" || st.k === "gone") {
          if (st.k === "out") cnt.inCh++;
          const x = st.k === "out" ? G.chanX1 + 20 - (G.chanX1 - G.chanX0 + 80) * st.f : G.chanX0 - 60 - 60 * st.f;
          hull(x, G.midY + 12, len, 8, col, -1, st.k === "gone" ? 1 - st.f : 1);
        } else if (st.k === "basin") {
          cnt.basin++; const k = cnt.basin; hull(G.chanX1 + 30 + (k % 3) * 36, G.midY - 60 + Math.floor(k / 3) * 22, len, 8, col, 1);
        } else if (st.k === "berth") {
          cnt.atBerth++;
          const ti = terms.findIndex(x => x.TerminalID === s.TerminalID); if (ti < 0) continue;
          perTerm[ti]++;
          const L = G.tl[ti]; const slotH = (L.y1 - L.y0) / L.n;
          const by = L.y0 + ((s.BerthSlot || 1) - .5) * slotH;
          const ln = Math.min(slotH - 6, len * 1.1);
          hull(G.quayX - 12, by, ln, 10, col, 0);
          // status bar
          const bx = G.quayX - 60, bw = 38;
          ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(bx, by - 3, bw, 6);
          if (st.sub === "svc") { cnt.svc++; ctx.fillStyle = handStop ? "#C8413A" : "#2E9E5B"; ctx.fillRect(bx, by - 3, bw * Math.max(0, Math.min(1, st.prog)), 6); }
          else if (st.sub === "wo") { cnt.wo++; ctx.fillStyle = "#C98A06"; ctx.fillRect(bx, by - 3, bw, 6); }
          else { ctx.fillStyle = "#7D8B98"; ctx.fillRect(bx, by - 3, bw * .3, 6); }
          ctx.font = "10px system-ui, sans-serif"; ctx.fillStyle = cssVar("--ink-2"); ctx.textAlign = "right";
          ctx.fillText("#" + s.CallID, bx - 3, by + 3);
        }
      }
      // anchorage grid
      anchored.sort((a, b) => a.ETA_h - b.ETA_h);
      const R = Math.min(G.seaW * 0.40, H * 0.36);
      const cols = Math.max(2, Math.floor(R * 2 / 30));
      anchored.forEach((s, i) => {
        const cause = anchorCause(s); cnt.anchor++; cnt[cause]++;
        const r = Math.floor(i / cols), cI = i % cols;
        const x = G.anchor.x - R + 16 + cI * 30 + (r % 2) * 12, y = G.anchor.y - R * 0.8 + r * 18;
        const len = Math.min(24, shipLen(s) * .6);
        hull(x, y, len, 6, typeColors[s.ShipTypeName] || "#888", -1);
        ctx.fillStyle = COLORS.cause[cause]; ctx.beginPath(); ctx.arc(x - len / 2 - 4, y, 3, 0, 7); ctx.fill();
      });
      // night shading
      const tod = ((tt - 1) % 24 + 24) % 24;
      const night = tod < 6 || tod >= 18 ? 1 : (tod < 7 ? 7 - tod : tod >= 17 ? tod - 17 : 0);
      if (night > 0) { ctx.fillStyle = `rgba(8,20,40,${0.18 * Math.min(1, night)})`; ctx.fillRect(0, 0, W, H); }
      // banners
      ctx.textAlign = "left"; ctx.font = "700 11px system-ui, sans-serif";
      if (handStop) { ctx.fillStyle = "rgba(200,65,58,.9)"; ctx.fillRect(G.quayX - 150, H - 22, 140, 18); ctx.fillStyle = "#fff"; ctx.fillText(t("a.handlingStop"), G.quayX - 144, H - 9); }
      const navBad = hsNow > p["rules.maxWaveForChannel_m"];
      if (navBad) { ctx.fillStyle = "rgba(122,81,149,.9)"; ctx.fillRect(G.chanX0 + 10, H - 22, 160, 18); ctx.fillStyle = "#fff"; ctx.fillText(t("a.navClosed"), G.chanX0 + 16, H - 9); }
      updateSide(cnt, perTerm, handStop);
    }

    // side panel ------------------------------------------------------------
    side.innerHTML = "";
    const clock = h("div", { class: "clock" }), sub = h("div", { class: "muted small" });
    const gauges = h("div", { class: "stack", style: { gap: "8px" } });
    const counts = h("div", { class: "stat-list" });
    side.append(
      h("div", { class: "card" }, clock, sub),
      h("div", { class: "card" }, h("h3", { style: { marginBottom: "10px" } }, t("a.env")), gauges),
      h("div", { class: "card" }, h("h3", { style: { marginBottom: "10px" } }, t("a.counts")), counts),
      h("div", { class: "card" }, h("div", { class: "legend-inline" },
        Object.entries(typeColors).map(([n, c]) => h("span", {}, h("i", { style: { background: c } }), n)),
        h("span", { style: { flexBasis: "100%", height: "2px" } }),
        ["berth", "tide", "weather", "day", "channel"].map(k => h("span", {}, h("i", { style: { background: COLORS.cause[k], borderRadius: "50%", width: "8px", height: "8px" } }), t("cause." + k)))))
    );
    function gauge(label, v, max, limit, unit, color, text) {
      const pct = Math.max(0, Math.min(1, v / max)) * 100;
      return h("div", { class: "gauge-row" }, h("span", {}, label),
        h("div", { class: "gauge" }, h("div", { style: { width: pct + "%", background: color } }), limit != null ? h("i", { style: { left: Math.min(100, limit / max * 100) + "%" } }) : null),
        h("b", { class: "num", style: { textAlign: "right" } }, text || (fmt(v, 2) + " " + unit)));
    }
    function updateSide(cnt, perTerm, handStop) {
      clock.textContent = fmtDate(tt);
      sub.textContent = `${LANG === "vi" ? "Giờ mô phỏng" : "Sim hour"} ${fmt(tt, 1)}`;
      const wl = envAt(env.waterLevel, tt), hs = envAt(env.hs, tt), wind = envAt(env.wind, tt);
      gauges.innerHTML = "";
      const wlMin = Math.min(...env.waterLevel), wlMax = Math.max(...env.waterLevel);
      gauges.append(
        gauge(LANG === "vi" ? "Mực nước" : "Water level", wl - wlMin, wlMax - wlMin || 1, null, "", "#2E86AB", fmt(wl, 2) + " m"),
        h("div", { class: "small muted", style: { marginTop: "-6px", textAlign: "right" } }, `${LANG === "vi" ? "Độ sâu luồng" : "Channel depth"} ${fmt(p["channel.depth_m"] + wl, 2)} m`),
        gauge("Hs", hs, Math.max(p["rules.maxWaveForChannel_m"] * 1.4, 1), p["rules.maxWaveForHandling_m"], "m", hs > p["rules.maxWaveForHandling_m"] ? "#C8413A" : "#3BB273"),
        gauge(LANG === "vi" ? "Gió" : "Wind", wind, Math.max(p["rules.maxWindForHandling_ms"] * 1.6, 5), p["rules.maxWindForHandling_ms"], "m/s", wind > p["rules.maxWindForHandling_ms"] ? "#C8413A" : "#3BB273"));
      counts.innerHTML = "";
      const add = (a, b, color) => counts.append(h("span", {}, color ? h("i", { style: { display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: color, marginRight: "6px" } }) : null, a), h("b", {}, b));
      add(t("a.anchorage"), cnt.anchor);
      ["berth", "tide", "weather", "day", "channel"].forEach(k => cnt[k] && add("  " + t("cause." + k), cnt[k], COLORS.cause[k]));
      add(t("a.inChannel"), cnt.inCh);
      if (cnt.basin) add(t("a.basin"), cnt.basin);
      add(t("a.atBerth"), cnt.atBerth);
      terms.forEach((tm, i) => add("  " + tm.TerminalName, `${perTerm[i]}/${tm.BerthCount}`));
      add(LANG === "vi" ? "  Đang làm hàng" : "  Working cargo", cnt.svc, handStop ? "#C8413A" : "#2E9E5B");
      add(LANG === "vi" ? "  Chờ rời bến" : "  Waiting to sail", cnt.wo, "#C98A06");
    }

    // loop -------------------------------------------------------------------
    function frame(ts) {
      if (!playing) { last = null; return; }
      if (last != null) { tt += speed * (ts - last) / 1000; if (tt > tEnd) { tt = tEnd; playing = false; cfg.onState && cfg.onState(false); } }
      last = ts; render(); cfg.onTime && cfg.onTime(tt);
      requestAnimationFrame(frame);
    }
    const ro = new ResizeObserver(() => { G = layout(); render(); }); ro.observe(canvasWrap);
    render();
    return {
      play() { if (!playing) { playing = true; cfg.onState && cfg.onState(true); requestAnimationFrame(frame); } },
      pause() { playing = false; cfg.onState && cfg.onState(false); },
      toggle() { playing ? this.pause() : this.play(); },
      seek(x) { tt = Math.max(tStart, Math.min(tEnd, x)); render(); },
      setSpeed(v) { speed = v; },
      get time() { return tt; },
      destroy() { playing = false; ro.disconnect(); },
    };
  }
  return { create };
})();
