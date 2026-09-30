/* Page renderers */
const WAIT_IN = ["WaitBerth_h", "WaitTideIn_h", "WaitWeatherIn_h", "WaitDaylightIn_h", "WaitChannelIn_h"];
const WAIT_OUT = ["WaitTideOut_h", "WaitWeatherOut_h", "WaitDaylightOut_h", "WaitChannelOut_h"];
const WAIT_ALL = [...WAIT_IN, "HandlingDowntime_h", ...WAIT_OUT];

function kget(id) { return App.result.kpis.summary.find(s => s.id === id) || { mean: 0, ci: 0 }; }
function card(title, body, opts = {}) {
  return h("div", { class: "card " + (opts.cls || "") },
    title ? h("div", { class: "card-head" }, h("h3", {}, title), opts.right || (opts.hint ? h("span", { class: "hint" }, opts.hint) : null)) : null,
    body);
}
function chartBox(height) { return h("div", { class: "chart", style: { minHeight: (height || 260) + "px" } }); }
function needResult(view) {
  if (App.result) return true;
  view.appendChild(h("div", { class: "card", style: { textAlign: "center", padding: "50px" } },
    h("p", { class: "muted" }, t("common.needResult")), h("a", { class: "btn btn-primary", href: "#/run" }, t("common.goRun"))));
  return false;
}
function tabs(items, current, onSelect) {
  const el = h("div", { class: "tabs" });
  items.forEach(([id, label]) => el.appendChild(h("button", { class: id === current ? "on" : "", onclick: () => onSelect(id) }, label)));
  return el;
}
function pageHead(title, lead, right) {
  return h("div", { class: "page-head" }, h("div", {}, h("h1", {}, title), lead ? h("p", {}, lead) : null), right ? h("div", { class: "toolbar" }, right) : null);
}
function hoursXFmt(v) { return fmtDate(v, false); }
function timeTicks(x0, x1, pw) {
  const span = x1 - x0; const n = Math.max(2, Math.floor(pw / 90));
  const cand = [6, 12, 24, 48, 24 * 7, 24 * 14, 730, 1460];
  const step = cand.find(c => span / c <= n) || 2190;
  const out = []; let v = Math.ceil((x0 - 1) / step) * step + 1; for (; v <= x1; v += step) out.push(v); return out;
}

const Pages = {
  /* ================================================================= DASHBOARD */
  dashboard(view) {
    if (!App.result) return Pages.hero(view);
    const R = App.result, K = R.kpis, m = R.meta;
    view.appendChild(pageHead(t("dash.title"), t("dash.runsInfo", { n: m.nRuns, a: fmt(m.measureStart, 0), b: fmt(m.measureEnd, 0), c: m.created }), [
      h("a", { class: "btn", href: `api/runs/${App.runId}/export.xlsx?lang=${LANG}` }, "⤓ " + t("run.exportX")),
      h("a", { class: "btn", href: "#/scenarios" }, "⇄ " + t("run.saveScen")),
    ]));
    const ws = kget("ws_ratio").mean, sl = kget("service_level").mean;
    const tile = (label, value, unit, sub, cls) => h("div", { class: "kpi " + (cls || "") }, h("div", { class: "kpi-label" }, label),
      h("div", { class: "kpi-value" }, value, unit ? h("span", { class: "unit" }, unit) : null), h("div", { class: "kpi-sub" }, sub));
    const ci = id => t("dash.ci", { ci: fmt(kget(id).ci, 1) });
    view.appendChild(h("div", { class: "kpis" },
      tile(t("k.throughput"), fmtBig(kget("throughput_annual_t").mean), "t", t("k.calls", { n: fmt(kget("calls").mean * 8760 / m.measure_h, 0) })),
      tile(t("k.service"), fmt(sl, 1), "%", t("k.unserved", { v: fmt(kget("rejected").mean, 1) }), sl < 95 ? "crit" : sl < 99 ? "warn" : "ok"),
      tile(t("k.ta"), fmt(kget("mean_turnaround_h").mean, 1), "h", ci("mean_turnaround_h") + " · " + t("k.p90", { v: fmt(kget("p90_turnaround_h").mean, 0) })),
      tile(t("k.ws"), fmt(ws, 2), "", t("k.wsRef"), ws > 0.5 ? "crit" : ws > 0.2 ? "warn" : "ok"),
      tile(t("k.occ"), fmt(kget("berth_occupancy").mean, 1), "%", ci("berth_occupancy")),
      tile(t("k.prewait"), fmt(kget("mean_prewait_h").mean, 1), "h", ci("mean_prewait_h") + " · " + t("k.berthTime", { v: fmt(kget("mean_berth_time_h").mean, 1) })),
      tile(t("k.queue"), fmt(kget("mean_anchorage_queue").mean, 2), t("common.ships"), t("k.maxQ", { v: fmt(kget("max_anchorage_queue").mean, 0) })),
      tile(t("k.chan"), fmt(kget("channel_utilization").mean, 1), "%", ci("channel_utilization")),
    ));
    // row: waiting + alerts
    const cWait = chartBox(250), cOcc = chartBox(250);
    const alerts = h("div", { class: "alerts" });
    (K.alerts.length ? K.alerts : [{ level: "ok", code: "none" }]).forEach(a => {
      const txt = a.code === "none" ? t("dash.noAlerts") : t("alert." + a.code, { v: fmt(a.value, a.code === "WS_HIGH" || a.code === "WS_MED" ? 2 : 1), t: a.terminal || "", r: fmt(a.ref || 0, 0) });
      alerts.appendChild(h("div", { class: "alert " + a.level }, h("span", { class: "dot" }), h("span", {}, txt)));
    });
    view.appendChild(h("div", { class: "grid g-side", style: { marginBottom: "16px" } },
      h("div", { class: "grid g2" }, card(t("dash.waitBreak"), cWait, { hint: "h / " + (LANG === "vi" ? "lượt" : "call") }), card(t("dash.occ"), cOcc)),
      card(t("dash.alerts"), alerts)));
    const keys = WAIT_ALL.filter(k => K.waitingBreakdown[k] > 0.005);
    Charts.bar(cWait, { horizontal: true, categories: keys.map(k => t("wait." + k)), series: [{ name: "h", data: keys.map(k => K.waitingBreakdown[k]), colors: keys.map(k => COLORS.wait[k]) }], valueLabels: true, legend: false, height: 250, fmt: v => fmt(v, 1) });
    Charts.bar(cOcc, {
      categories: K.terminals.map(x => x.TerminalName), height: 250, fmt: v => fmt(v, 0) + "%", tipFmt: v => fmt(v, 1) + "%",
      series: [{ name: t("res.occ"), data: K.terminals.map(x => x.BerthOccupancy), colors: K.terminals.map(x => x.BerthOccupancy > x.UnctadMax + 10 ? "#C8413A" : x.BerthOccupancy > x.UnctadMax ? "#E8A33C" : "#2E86AB") }],
      refs: [{ label: t("res.unctad"), values: K.terminals.map(x => x.UnctadMax), color: cssVar("--ink") }], valueLabels: true,
    });
    // row: monthly + histogram
    const cM = chartBox(240), cH = chartBox(240);
    view.appendChild(h("div", { class: "grid g2", style: { marginBottom: "16px" } }, card(t("dash.monthly"), cM, { hint: "t" }), card(t("dash.ta"), cH, { hint: t("k.p90", { v: fmt(kget("p90_turnaround_h").mean, 0) }) })));
    Charts.bar(cM, { categories: MONTHS[LANG], series: [{ name: t("dash.monthly"), data: K.monthly, color: "#0E9AA7" }], height: 240, legend: false });
    const hist = K.turnaroundHist;
    Charts.bar(cH, { categories: hist.counts.map((_, i) => fmt(hist.edges[i], 0)), series: [{ name: LANG === "vi" ? "Số lượt" : "Calls", data: hist.counts, color: "#2E86AB" }], height: 240, legend: false, barWidth: .95, skipLabels: 3, tipTitle: i => `${fmt(hist.edges[i], 0)}–${fmt(hist.edges[i + 1], 0)} h` });
    // terminal table
    const tt = h("div");
    view.appendChild(card(t("dash.termTable"), tt));
    Pages._termTable(tt, K.terminals);
  },

  _termTable(el, rows) {
    Grid.table(el, {
      rows, columns: [
        { key: "TerminalName", label: t("common.terminal") },
        { key: "BerthCount", label: LANG === "vi" ? "Số bến" : "Berths", num: true, d: 0 },
        { key: "Calls", label: LANG === "vi" ? "Lượt đến" : "Calls", num: true, d: 1 },
        { key: "Cargo_t", label: LANG === "vi" ? "Sản lượng (t)" : "Cargo (t)", num: true, fmt: v => fmt(v, 0) },
        { key: "BerthOccupancy", label: t("res.occ") + " %", num: true, cls: r => r.BerthOccupancy > r.UnctadMax + 10 ? "cell-crit" : r.BerthOccupancy > r.UnctadMax ? "cell-warn" : "", fmt: (v, r) => `${fmt(v, 1)} ± ${fmt(r.BerthOccupancy_ci, 1)}` },
        { key: "UnctadMax", label: t("res.unctad") + " %", num: true, d: 0 },
        { key: "BerthWorking", label: t("res.working") + " %", num: true },
        { key: "QuayUtilization", label: t("res.quay") + " %", num: true },
        { key: "CraneUtilization", label: t("res.crane") + " %", num: true },
        { key: "MeanWaitBerth_h", label: t("wait.WaitBerth_h") + " (h)", num: true },
        { key: "MeanBerthTime_h", label: (LANG === "vi" ? "Tại bến" : "At berth") + " (h)", num: true },
        { key: "MeanTurnaround_h", label: t("k.ta") + " (h)", num: true },
      ],
    });
  },

  hero(view) {
    view.appendChild(h("div", { class: "card hero" },
      h("div", {},
        h("h1", {}, t("hero.title")), h("p", {}, t("hero.lead")),
        h("div", { class: "steps" }, [1, 2, 3, 4].map(i => h("div", { class: "step" }, h("b", {}, i), h("span", {}, t("hero.s" + i))))),
        h("div", { class: "row", style: { marginTop: "22px" } },
          h("button", { class: "btn-primary btn-lg", onclick: async () => { await App.loadDemo(); location.hash = "#/run"; } }, "▶ " + t("hero.start")),
          h("a", { class: "btn btn-lg", href: "#/inputs" }, t("nav.inputs")))),
      h("div", {}, h("h3", { style: { marginBottom: "12px" } }, t("hero.features")),
        h("ul", { class: "feature-list" }, [1, 2, 3, 4, 5, 6].map(i => h("li", {}, t("hero.f" + i)))))));
  },

  /* ================================================================= INPUTS */
  inputs(view, sub) {
    sub = sub || "params";
    const S = App.schema, I = App.inputs;
    view.appendChild(pageHead(t("in.title"), t("in.lead"), [
      h("button", { onclick: async () => { await App.loadDemo(); App.route(); } }, "↺ " + t("in.loadDemo")),
      h("button", { onclick: () => downloadPost("api/inputs/export?format=xlsx", I, "port_inputs.xlsx").catch(e => toast(e.message, true)) }, "⤓ " + t("in.exportX")),
      h("a", { class: "btn btn-primary", href: "#/run" }, "▶ " + t("nav.run")),
    ]));
    view.appendChild(tabs([["params", t("in.tab.params")], ["terminals", t("in.tab.terms")], ["fleet", t("in.tab.fleet")], ["env", t("in.tab.env")], ["check", t("in.tab.check")], ["io", t("in.tab.io")]],
      sub, id => location.hash = "#/inputs/" + id));
    const body = h("div"); view.appendChild(body);
    const changed = () => App.saveInputs();

    if (sub === "params") {
      const nChanged = S.params.filter(p => String(I.params[p.key]) !== String(p.default)).length;
      body.appendChild(h("div", { class: "row", style: { marginBottom: "12px" } }, h("span", { class: "muted" }, t("in.changed", { n: nChanged })), h("span", { class: "spacer" }),
        h("button", { class: "btn-sm", onclick: () => { S.params.forEach(p => I.params[p.key] = p.default); changed(); App.route(); } }, t("in.resetAll"))));
      const grid = h("div", { class: "pgroups" });
      S.groups.forEach(g => {
        const list = h("div");
        S.params.filter(p => p.group === g.id).forEach(p => {
          const v = I.params[p.key];
          let inp;
          if (p.type === "enum") inp = h("select", {}, p.options.map(o => h("option", { value: o, selected: o === v }, o)));
          else if (p.type === "bool") inp = h("select", {}, h("option", { value: 1, selected: !!v }, LANG === "vi" ? "Có (1)" : "Yes (1)"), h("option", { value: 0, selected: !v }, LANG === "vi" ? "Không (0)" : "No (0)"));
          else inp = h("input", { type: p.type === "str" ? "text" : "number", step: p.type === "int" ? 1 : "any", value: v ?? "" });
          const row = h("div", { class: "pfield" + (String(v) !== String(p.default) ? " changed" : "") },
            h("label", {}, L(p), p.help ? h("span", { class: "help-dot", title: p.help }, "?") : null, h("span", { class: "key" }, p.key)), inp, h("span", { class: "unit" }, p.unit));
          inp.onchange = () => {
            let nv = inp.value;
            if (p.type === "float") nv = Number(nv); else if (p.type === "int" || p.type === "bool") nv = Math.round(Number(nv));
            I.params[p.key] = nv; row.classList.toggle("changed", String(nv) !== String(p.default)); changed();
          };
          list.appendChild(row);
        });
        grid.appendChild(card(L(g), list));
      });
      body.appendChild(grid);
    }

    if (sub === "terminals" || sub === "fleet") {
      const isT = sub === "terminals";
      const cols = isT ? S.terminalColumns : S.fleetColumns;
      const summary = h("div", { class: "muted", style: { marginBottom: "10px" } });
      const upd = () => {
        if (isT) summary.textContent = t("in.termSum", { n: I.terminals.length, b: I.terminals.reduce((a, x) => a + (x.BerthCount || 0), 0), l: fmt(I.terminals.reduce((a, x) => a + (x.BerthLength_m || 0), 0), 0), c: I.terminals.reduce((a, x) => a + (x.Cranes || 0), 0) });
        else summary.textContent = t("in.fleetSum", { n: fmt(I.fleet.reduce((a, x) => a + (x.AnnualCalls || 0), 0) * (I.params["arrival.demandFactor"] || 1), 0), c: I.fleet.length });
      };
      upd();
      const adv = h("input", { type: "checkbox", checked: store.get("adv." + sub, true) });
      const gridEl = h("div");
      body.appendChild(h("div", { class: "row" }, summary, h("span", { class: "spacer" }), h("label", { class: "row small" }, adv, t("in.advanced"))));
      const termIds = () => new Set(I.terminals.map(x => x.TerminalID));
      const g = Grid.editable(gridEl, {
        columns: cols, rows: () => (isT ? I.terminals : I.fleet), showOptional: () => adv.checked, idField: isT ? "TerminalID" : "ShipTypeID",
        onChange: () => { changed(); upd(); },
        validate: (r, c) => {
          const v = r[c.name];
          if (c.required && (v === null || v === undefined || v === "")) return false;
          if (c.type !== "str" && v != null && (v < 0 || Number.isNaN(v))) return false;
          if (!isT && (c.name === "TerminalID" || c.name === "AltTerminalID") && v != null && !termIds().has(v)) return false;
          if (["LOA_m", "Beam_m", "Draft_m", "Speed_ms", "DWT_t"].includes(c.name) && !(v > 0)) return false;
          return true;
        },
        newRow: rows => isT
          ? { TerminalID: Math.max(0, ...rows.map(r => r.TerminalID || 0)) + 1, TerminalName: "T" + (rows.length + 1), BerthCount: 1, BerthLength_m: 250, Cranes: 1, ServiceRate_tph: 1000 }
          : { ShipTypeID: Math.max(0, ...rows.map(r => r.ShipTypeID || 0)) + 1, ShipTypeName: "New type", AnnualCalls: 50, TerminalID: I.terminals[0]?.TerminalID || 1, LOA_m: 150, Beam_m: 24, Draft_m: 8, DWT_t: 15000, Speed_ms: 5 },
      });
      adv.onchange = () => { store.set("adv." + sub, adv.checked); g.render(); };
      body.appendChild(gridEl);
      body.appendChild(h("p", { class: "small muted" }, "◼ " + t("in.required") + " · ", h("i", {}, t("in.optional"))));
    }

    if (sub === "env") {
      const P = I.params, E = I.env;
      const x = E.waterLevel.hour.length ? E.waterLevel.hour : E.wave.hour;
      const stats = h("div", { class: "stat-list" });
      const hs = E.wave.value, wd = E.wind.value;
      const n = Math.max(hs.length, wd.length) || 1;
      let hand = 0, nav = 0;
      for (let i = 0; i < n; i++) {
        const a = hs[i] ?? 0, b = wd[i] ?? 0;
        if (a <= P["rules.maxWaveForHandling_m"] && b <= P["rules.maxWindForHandling_ms"]) hand++;
        if (a <= P["rules.maxWaveForChannel_m"] && (!(P["rules.maxWindForChannel_ms"] > 0) || b <= P["rules.maxWindForChannel_ms"])) nav++;
      }
      stats.append(h("span", {}, t("in.env.hand")), h("b", {}, fmt(100 * hand / n, 1) + " %"), h("span", {}, t("in.env.nav")), h("b", {}, fmt(100 * nav / n, 1) + " %"));
      const maxDraft = Math.max(...I.fleet.map(f => f.Draft_m || 0));
      const needWL = maxDraft + P["rules.minUKC_m"] - P["channel.depth_m"];
      const wl = E.waterLevel.value;
      if (wl.length) stats.append(h("span", {}, t("in.env.depthNeed") + ` (${fmt(maxDraft, 1)} m)`), h("b", {}, fmt(needWL, 2) + " m · " + fmt(100 * wl.filter(v => v >= needWL).length / wl.length, 1) + "%"));
      body.appendChild(h("div", { class: "grid g-side", style: { marginBottom: "16px" } }, h("div", { class: "chart-hint" }, t("common.zoomHint")), card(t("in.envStats"), stats)));
      const c1 = chartBox(200), c2 = chartBox(200), c3 = chartBox(200);
      body.append(card(t("in.env.wl"), c1), h("div", { style: { height: "16px" } }), card(t("in.env.hs"), c2), h("div", { style: { height: "16px" } }), card(t("in.env.wind"), c3));
      const common = { height: 200, xFmt: hoursXFmt, xTicks: timeTicks, legend: false, tipTitle: v => fmtDate(v) };
      Charts.line(c1, { ...common, x: E.waterLevel.hour, series: [{ name: "WL", data: E.waterLevel.value, color: "#2E86AB", area: true }], refs: [{ value: needWL, label: t("in.env.depthNeed"), color: "#C8413A" }], fmt: v => fmt(v, 2) });
      Charts.line(c2, { ...common, x: E.wave.hour, series: [{ name: "Hs", data: E.wave.value, color: "#7A5195", area: true }], yMin: 0, refs: [{ value: P["rules.maxWaveForChannel_m"], label: t("in.env.limitNav"), color: "#C8413A" }, { value: P["rules.maxWaveForHandling_m"], label: t("in.env.limitHand"), color: "#E8A33C" }], fmt: v => fmt(v, 2) });
      Charts.line(c3, { ...common, x: E.wind.hour, series: [{ name: "Wind", data: E.wind.value, color: "#3BB273", area: true }], yMin: 0, refs: [{ value: P["rules.maxWindForHandling_ms"], label: t("in.env.limitHand"), color: "#E8A33C" }], fmt: v => fmt(v, 1) });
    }

    if (sub === "check") {
      const out = h("div", { class: "stack" });
      body.appendChild(out);
      out.appendChild(h("p", { class: "muted" }, t("common.loading")));
      API.post("api/inputs/check", I).then(res => {
        out.innerHTML = "";
        out.appendChild(h("div", { class: "alert " + (res.ok ? "ok" : "crit") }, h("span", { class: "dot" }), res.ok ? t("in.checkOk") : t("in.checkFail")));
        const tb = h("div");
        Grid.table(tb, {
          rows: res.rows, columns: [
            { key: "status", label: t("common.status"), fmt: v => h("span", { class: "badge " + v }, v) },
            { key: "component", label: LANG === "vi" ? "Hạng mục" : "Component" },
            { key: LANG === "vi" ? "message_vi" : "message_en", label: LANG === "vi" ? "Nội dung" : "Message" },
          ],
        });
        out.appendChild(card(t("in.check"), tb));
        const capT = h("div"), capC = chartBox(220);
        Grid.table(capT, {
          rows: res.capacity, columns: [
            { key: "TerminalName", label: t("common.terminal") }, { key: "Berths", label: LANG === "vi" ? "Số bến" : "Berths", num: true, d: 0 },
            { key: "CallsPerYear", label: t("in.cap.calls"), num: true, d: 0 }, { key: "MeanService_h", label: t("in.cap.svc"), num: true },
            { key: "Rho", label: t("in.cap.rho") + " %", num: true, cls: r => r.Rho > 100 ? "cell-crit" : r.Rho > r.UnctadMax ? "cell-warn" : "" },
            { key: "UnctadMax", label: t("res.unctad") + " %", num: true, d: 0 }, { key: "Wq_h", label: t("in.cap.wq"), num: true, fmt: v => v == null || !isFinite(v) ? "∞" : fmt(v, 1) },
          ],
        });
        out.appendChild(card(t("in.capTitle"), h("div", { class: "grid g2" }, h("div", {}, capT, h("p", { class: "small muted" }, t("in.capNote"))), capC)));
        Charts.bar(capC, { categories: res.capacity.map(c => c.TerminalName), series: [{ name: t("in.cap.rho"), data: res.capacity.map(c => Math.min(c.Rho, 150)), colors: res.capacity.map(c => c.Rho > c.UnctadMax ? "#E8A33C" : "#2E86AB") }], refs: [{ label: t("res.unctad"), values: res.capacity.map(c => c.UnctadMax), color: cssVar("--ink") }], fmt: v => fmt(v, 0) + "%", height: 220, valueLabels: true });
      }).catch(e => { out.innerHTML = ""; out.appendChild(h("div", { class: "alert crit" }, h("span", { class: "dot" }), e.message)); });
    }

    if (sub === "io") {
      const fileIn = h("input", { type: "file", multiple: true, accept: ".xlsx,.xlsm", style: { display: "none" } });
      const dz = h("div", { class: "dropzone" }, h("div", { style: { fontSize: "28px" } }, "⇪"), h("strong", {}, t("in.drop")), h("p", { class: "small" }, t("in.dropSub")), fileIn);
      const msgs = h("div", { class: "stack", style: { gap: "6px", marginTop: "12px" } });
      const doUpload = async files => {
        if (!files.length) return;
        try {
          const res = await API.upload("api/inputs/import", files, I);
          App.inputs = res.inputs; App.saveInputs();
          msgs.innerHTML = "";
          res.messages.forEach(m => msgs.appendChild(h("div", { class: "alert info" }, h("span", { class: "dot" }), m)));
          const fails = res.check.rows.filter(r => r.status === "FAIL");
          msgs.appendChild(h("div", { class: "alert " + (res.check.ok ? "ok" : "crit") }, h("span", { class: "dot" }), res.check.ok ? t("in.checkOk") : t("in.checkFail") + " " + fails.map(f => f.component + ": " + f.message_vi).join("; ")));
          toast(t("in.imported") + ": " + files.length + " file");
        } catch (e) { toast(e.message, true); }
      };
      dz.onclick = () => fileIn.click();
      fileIn.onchange = () => doUpload(Array.from(fileIn.files));
      dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
      dz.ondragleave = () => dz.classList.remove("over");
      dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); doUpload(Array.from(e.dataTransfer.files)); };
      body.appendChild(h("div", { class: "grid g2" },
        card(LANG === "vi" ? "Nhập từ Excel" : "Import from Excel", h("div", {}, dz, msgs)),
        card(LANG === "vi" ? "Xuất dữ liệu đầu vào" : "Export inputs", h("div", { class: "stack", style: { gap: "10px" } },
          h("button", { onclick: () => downloadPost("api/inputs/export?format=xlsx", I, "port_inputs.xlsx").catch(e => toast(e.message, true)) }, "⤓ " + t("in.exportX")),
          h("button", { onclick: () => downloadPost("api/inputs/export?format=zip", I, "port_inputs_v1_5_format.zip").catch(e => toast(e.message, true)) }, "⤓ " + t("in.exportZip")),
          h("p", { class: "small muted" }, LANG === "vi" ? "Định dạng v1.5.1 giữ nguyên tên file và cột để dùng lại với phiên bản MATLAB. Workbook gộp chứa toàn bộ tham số mới kèm đơn vị và mô tả." : "The v1.5.1 format keeps file and column names so it can be reused in MATLAB. The combined workbook includes all new parameters with units and descriptions.")))));
    }
  },

  /* ================================================================= RUN */
  run(view) {
    const I = App.inputs, P = I.params;
    const nameIn = h("input", { value: store.get("lastName", LANG === "vi" ? "Hiện trạng" : "Base case"), style: { width: "100%" } });
    const bar = h("div", { class: "progress" }, h("div"));
    const stat = h("div", { class: "muted small" }, "");
    const logEl = h("div", { class: "log" }, "");
    const startBtn = h("button", { class: "btn-primary btn-lg" }, "▶ " + t("run.start"));
    const cancelBtn = h("button", { class: "btn-danger", disabled: true }, "■ " + t("run.cancel"));
    const calls = I.fleet.reduce((a, x) => a + (x.AnnualCalls || 0), 0) * (P["arrival.demandFactor"] || 1);
    const set = h("div", { class: "stat-list" });
    [[LANG === "vi" ? "Số lần chạy" : "Replications", P["sim.nRuns"]], [LANG === "vi" ? "Kỳ mô phỏng" : "Period", `${P["sim.startHour"]}–${P["sim.endHour"]} h (warm-up ${P["sim.warmup_h"]} h)`],
      ["Δt", P["sim.timeStep_h"] + " h"], [LANG === "vi" ? "Mô hình tàu đến" : "Arrivals", P["arrival.mode"]], [LANG === "vi" ? "Tổng lượt/năm" : "Calls/yr", fmt(calls, 0)],
      [LANG === "vi" ? "Giao thông luồng" : "Channel traffic", `${P["channel.trafficMode"]} · ${P["policy.priorityMode"]}`],
      [LANG === "vi" ? "Có bến mới vào luồng" : "Berth before channel", P["policy.berthBeforeChannel"] ? "✓" : "✗"],
      ["Terminal / " + (LANG === "vi" ? "loại tàu" : "ship types"), `${I.terminals.length} / ${I.fleet.length}`]].forEach(([a, b]) => set.append(h("span", {}, a), h("b", {}, b)));
    const hist = h("div");
    view.appendChild(pageHead(t("run.title"), null, null));
    view.appendChild(h("div", { class: "grid g-side", style: { marginBottom: "16px" } },
      card(null, h("div", { class: "stack" },
        h("label", {}, h("div", { class: "small muted", style: { marginBottom: "4px" } }, t("run.name")), nameIn),
        h("div", { class: "row" }, startBtn, cancelBtn, h("span", { class: "spacer" }), h("a", { href: "#/inputs/check", class: "small" }, t("in.check"))),
        h("div", {}, h("div", { class: "row small", style: { justifyContent: "space-between", marginBottom: "6px" } }, h("b", {}, t("run.progress")), stat), bar),
        h("div", {}, h("div", { class: "small", style: { marginBottom: "6px" } }, h("b", {}, t("run.log"))), logEl))),
      card(t("run.settings"), h("div", {}, set, h("p", { class: "small", style: { marginTop: "12px" } }, h("a", { href: "#/inputs" }, "✎ " + t("nav.inputs")))))));
    view.appendChild(card(t("run.history"), hist));
    const renderHist = () => {
      Grid.table(hist, {
        rows: App.runs, columns: [
          { key: "name", label: t("run.col.name"), fmt: (v, r) => h("span", {}, r.id === App.runId ? "● " : "", v) },
          { key: "created", label: t("run.col.created") },
          { key: "status", label: t("common.status"), fmt: v => h("span", { class: "badge " + v }, v) },
          { key: "ta", label: t("run.col.ta"), num: true, get: r => r.headline?.mean_turnaround_h },
          { key: "occ", label: t("run.col.occ") + " %", num: true, get: r => r.headline?.berth_occupancy },
          { key: "thr", label: t("run.col.thr"), num: true, get: r => r.headline?.throughput_annual_t, fmt: v => v == null ? "–" : fmt(v, 0) },
          { key: "ws", label: "W/S", num: true, get: r => r.headline?.ws_ratio, fmt: v => v == null ? "–" : fmt(v, 2) },
          {
            key: "act", label: "", fmt: (_, r) => h("span", { class: "row", style: { gap: "4px", flexWrap: "nowrap" } },
              r.status === "done" ? h("button", { class: "btn-sm", onclick: async e => { e.stopPropagation(); await App.openRun(r.id, true); location.hash = "#/dashboard"; } }, t("run.open")) : null,
              r.status === "done" ? h("a", { class: "btn btn-sm", href: `api/runs/${r.id}/export.xlsx?lang=${LANG}`, onclick: e => e.stopPropagation() }, "⤓ xlsx") : null,
              h("button", { class: "btn-sm btn-danger", onclick: async e => { e.stopPropagation(); await API.del(`api/runs/${r.id}`); if (App.runId === r.id) { App.result = null; App.runId = null; } await App.refreshRuns(); renderHist(); } }, "✕")),
          },
        ],
      });
    };
    renderHist();
    let poll = null, jobId = null;
    const watch = id => {
      jobId = id; startBtn.disabled = true; cancelBtn.disabled = false;
      poll = setInterval(async () => {
        try {
          const s = await API.get(`api/runs/${id}/status`);
          bar.firstChild.style.width = (100 * s.progress).toFixed(1) + "%";
          stat.textContent = `${s.status} · ${fmt(100 * s.progress, 0)}%`;
          logEl.textContent = s.log.join("\n"); logEl.scrollTop = logEl.scrollHeight;
          if (["done", "error", "cancelled"].includes(s.status)) {
            clearInterval(poll); poll = null; startBtn.disabled = false; cancelBtn.disabled = true;
            await App.refreshRuns(); renderHist();
            if (s.status === "done") {
              await App.openRun(id, true); toast(t("run.done"));
              stat.innerHTML = ""; stat.append(h("a", { href: "#/dashboard" }, "→ " + t("nav.dashboard")));
            } else toast(t("run.failed") + ": " + (s.error || ""), true);
          }
        } catch (e) { /* transient */ }
      }, 400);
    };
    startBtn.onclick = async () => {
      store.set("lastName", nameIn.value);
      try {
        logEl.textContent = "";
        const j = await API.post("api/runs", { inputs: I, name: nameIn.value });
        toast(t("run.started")); watch(j.id);
      } catch (e) {
        const rows = e.data?.check?.rows?.filter(r => r.status === "FAIL") || [];
        logEl.textContent = "ERROR: " + e.message + "\n" + rows.map(r => `  ${r.component}: ${LANG === "vi" ? r.message_vi : r.message_en}`).join("\n");
        toast(e.message, true);
      }
    };
    cancelBtn.onclick = () => jobId && API.post(`api/runs/${jobId}/cancel`, {});
    const running = App.runs.find(r => r.status === "running" || r.status === "queued");
    if (running) watch(running.id);
    App.cleanup = () => poll && clearInterval(poll);
  },

  /* ================================================================= RESULTS */
  async results(view, sub) {
    if (!needResult(view)) return;
    sub = sub || "wait";
    const R = App.result, K = R.kpis;
    view.appendChild(pageHead(t("res.title"), R.name, [h("a", { class: "btn", href: `api/runs/${App.runId}/export.xlsx?lang=${LANG}` }, "⤓ " + t("run.exportX")), h("a", { class: "btn", href: `api/runs/${App.runId}/export.json` }, "⤓ JSON")]));
    view.appendChild(tabs([["wait", t("res.tab.wait")], ["terminals", t("res.tab.term")], ["types", t("res.tab.types")], ["timeseries", t("res.tab.queue")], ["arrivals", t("res.tab.arr")], ["kpi", t("res.tab.kpi")], ["ships", t("res.tab.ships")]],
      sub, id => location.hash = "#/results/" + id));
    const body = h("div", { class: "stack" }); view.appendChild(body);
    const wb = K.waitingBreakdown;

    if (sub === "wait") {
      const c1 = chartBox(240), c2 = chartBox(240), c3 = chartBox(240), c4 = chartBox(260), rs = h("div");
      body.append(h("div", { class: "grid g2" }, card(t("dash.waitBreak"), c1, { hint: "h" }), card(t("res.waitShare"), c2)),
        h("div", { class: "grid g2" }, card(t("res.prewaitHist"), c3, { hint: "P90 " + fmt(kget("p90_prewait_h").mean, 1) + " h" }), card(t("res.reasons"), rs)),
        card(t("res.waitByType"), c4, { hint: "h / " + (LANG === "vi" ? "lượt" : "call") }));
      const phase = k => WAIT_IN.includes(k) ? 0 : k === "HandlingDowntime_h" ? 1 : 2;
      Charts.bar(c1, { categories: [t("res.waitIn"), t("cause.down"), t("res.waitOut")], stacked: true, horizontal: true, height: 240, valueLabels: true, fmt: v => fmt(v, 1),
        series: WAIT_ALL.map(k => ({ name: t("wait." + k), color: COLORS.wait[k], data: [0, 1, 2].map(i => i === phase(k) ? wb[k] : 0) })).filter(s => s.data.some(v => v > 0.001)) });
      const grp = { berth: wb.WaitBerth_h, tide: wb.WaitTideIn_h + wb.WaitTideOut_h, weather: wb.WaitWeatherIn_h + wb.WaitWeatherOut_h, day: wb.WaitDaylightIn_h + wb.WaitDaylightOut_h, channel: wb.WaitChannelIn_h + wb.WaitChannelOut_h, down: wb.HandlingDowntime_h };
      const tot = Object.values(grp).reduce((a, b) => a + b, 0);
      Charts.donut(c2, { items: Object.entries(grp).map(([k, v]) => ({ name: t("cause." + k), value: v, color: COLORS.cause[k] })), center: [fmt(tot, 1) + " h", LANG === "vi" ? "tổng/lượt" : "total/call"], fmt: v => fmt(v, 2) + " h", height: 240 });
      const hp = K.prewaitHist;
      Charts.bar(c3, { categories: hp.counts.map((_, i) => fmt(hp.edges[i], 0)), series: [{ name: LANG === "vi" ? "Số lượt" : "Calls", data: hp.counts, color: "#E4572E" }], legend: false, barWidth: .95, skipLabels: 3, height: 240, tipTitle: i => `${fmt(hp.edges[i], 1)}–${fmt(hp.edges[i + 1], 1)} h` });
      const reasons = Object.entries(K.reasons);
      if (!reasons.length) rs.appendChild(h("div", { class: "alert ok" }, h("span", { class: "dot" }), t("res.noUnserved")));
      else Grid.table(rs, { rows: reasons.map(([k, v]) => ({ k, v })), columns: [{ key: "k", label: LANG === "vi" ? "Nguyên nhân" : "Reason" }, { key: "v", label: LANG === "vi" ? "Số lượt TB / lần chạy" : "Mean per run", num: true }] });
      // waiting by type needs ship detail across runs: use run 1..n pooled
      const types = K.shipTypes.map(x => x.ShipTypeName);
      const acc = {}; types.forEach(tn => { acc[tn] = { n: 0 }; WAIT_ALL.forEach(k => acc[tn][k] = 0); });
      for (const rr of R.runList) {
        const d = await App.detail(rr.runIndex);
        d.ships.forEach(s => { if (!s.Served || !s.InMeasurement || !acc[s.ShipTypeName]) return; acc[s.ShipTypeName].n++; WAIT_ALL.forEach(k => acc[s.ShipTypeName][k] += s[k] || 0); });
      }
      Charts.bar(c4, { categories: types, stacked: true, height: 260, fmt: v => fmt(v, 1), valueLabels: true,
        series: WAIT_ALL.map(k => ({ name: t("wait." + k), color: COLORS.wait[k], data: types.map(tn => acc[tn].n ? acc[tn][k] / acc[tn].n : 0) })).filter(s => s.data.some(v => v > 0.01)) });
    }

    if (sub === "terminals") {
      const tt = h("div"), c1 = chartBox(260), c2 = chartBox(260);
      body.append(card(t("dash.termTable"), tt), h("div", { class: "grid g2" }, card(t("res.util"), c1), card(t("res.capVsSim"), c2, { hint: "%" })));
      Pages._termTable(tt, K.terminals);
      const cats = K.terminals.map(x => x.TerminalName);
      Charts.bar(c1, { categories: cats, height: 260, fmt: v => fmt(v, 0) + "%", tipFmt: v => fmt(v, 1) + "%",
        series: [{ name: t("res.occ"), data: K.terminals.map(x => x.BerthOccupancy), color: "#0B3D5C" }, { name: t("res.working"), data: K.terminals.map(x => x.BerthWorking), color: "#0E9AA7" },
          { name: t("res.quay"), data: K.terminals.map(x => x.QuayUtilization), color: "#F2A541" }, { name: t("res.crane"), data: K.terminals.map(x => x.CraneUtilization), color: "#7A5195" }],
        refs: [{ label: t("res.unctad"), values: K.terminals.map(x => x.UnctadMax), color: "#C8413A" }] });
      Charts.bar(c2, { categories: cats, height: 260, fmt: v => fmt(v, 0) + "%", tipFmt: v => fmt(v, 1) + "%",
        series: [{ name: t("res.analytic"), data: R.capacity.map(c => c.Rho), color: "#9FB3C3" }, { name: t("res.simulated") + " – " + t("res.occ"), data: K.terminals.map(x => x.BerthOccupancy), color: "#0B3D5C" }] });
      body.appendChild(h("p", { class: "small muted" }, LANG === "vi"
        ? "Chiếm dụng bến = thời gian vị trí bến bị giữ (kể cả đã phân bến chờ tàu cập, chờ triều/luồng rời bến) / (số bến × thời gian đo). Bến đang làm hàng = chỉ tính thời gian thực sự bốc xếp. Chênh lệch giữa hai chỉ số phản ánh tổn thất năng lực do thời tiết, thủy triều và điều tiết luồng."
        : "Berth occupancy = time berth positions are held (incl. assigned-but-empty and waiting to sail) / (berths × measured time). Berth working counts only actual cargo handling. The gap shows capacity lost to weather, tide and channel control."));
    }

    if (sub === "types") {
      const tt = h("div"), c1 = chartBox(260), c2 = chartBox(260);
      body.append(card(t("res.tab.types"), tt), h("div", { class: "grid g2" }, card(t("res.taByType"), c1, { hint: "h" }), card(t("res.access"), c2, { hint: "%" })));
      Grid.table(tt, {
        rows: K.shipTypes, columns: [
          { key: "ShipTypeName", label: t("common.shipType") }, { key: "Calls", label: LANG === "vi" ? "Lượt đến" : "Calls", num: true }, { key: "Served", label: LANG === "vi" ? "Phục vụ" : "Served", num: true },
          { key: "Cargo_t", label: LANG === "vi" ? "Sản lượng (t)" : "Cargo (t)", num: true, fmt: v => fmt(v, 0) }, { key: "MeanPreWait_h", label: t("k.prewait") + " (h)", num: true },
          { key: "MeanTideWait_h", label: t("cause.tide") + " (h)", num: true }, { key: "MeanBerthTime_h", label: (LANG === "vi" ? "Tại bến" : "At berth") + " (h)", num: true },
          { key: "MeanTurnaround_h", label: t("k.ta") + " (h)", num: true }, { key: "P90Turnaround_h", label: "P90 (h)", num: true },
          { key: "TidalAccessIn", label: t("res.accIn") + " %", num: true }, { key: "TidalAccessOut", label: t("res.accOut") + " %", num: true }, { key: "TransitTime_h", label: (LANG === "vi" ? "Hành trình" : "Transit") + " (h)", num: true, d: 2 },
        ],
      });
      const cats = K.shipTypes.map(x => x.ShipTypeName);
      Charts.bar(c1, { categories: cats, height: 260, fmt: v => fmt(v, 0), tipFmt: v => fmt(v, 1) + " h", series: [{ name: t("k.ta"), data: K.shipTypes.map(x => x.MeanTurnaround_h), colors: cats.map(c => App.typeColors[c]) }, { name: "P90", data: K.shipTypes.map(x => x.P90Turnaround_h), color: "#9FB3C3" }] });
      Charts.bar(c2, { categories: cats, height: 260, fmt: v => fmt(v, 0) + "%", tipFmt: v => fmt(v, 1) + "%", max: 100, series: [{ name: t("res.accIn"), data: K.shipTypes.map(x => x.TidalAccessIn), color: "#2E86AB" }, { name: t("res.accOut"), data: K.shipTypes.map(x => x.TidalAccessOut), color: "#7FB7D3" }] });
    }

    if (sub === "timeseries") {
      const sel = h("select", {}, R.runList.map(r => h("option", { value: r.runIndex }, `${t("common.run")} ${r.runIndex}`)));
      const k0 = store.get("tsRun", 1); sel.value = k0;
      const c1 = chartBox(240), c2 = chartBox(240), c3 = chartBox(200);
      body.append(h("div", { class: "row" }, h("label", { class: "row small" }, t("res.selectRun"), sel), h("span", { class: "chart-hint" }, t("common.zoomHint"))),
        card(t("res.queueTs"), c1), card(t("res.berthTs"), c2), card(t("res.envTs"), c3));
      const charts = [];
      const sync = r => charts.forEach(c => c.setRange(r));
      const draw = async () => {
        const d = await App.detail(Number(sel.value));
        const S = d.series; const n = S.q_berth.length;
        const x = Array.from({ length: n }, (_, i) => d.t0 + i);
        const common = { x, xFmt: hoursXFmt, xTicks: timeTicks, tipTitle: v => fmtDate(v), onZoom: r => sync(r), keepZoom: false };
        charts.length = 0;
        charts.push(Charts.line(c1, { ...common, height: 240, stacked: true, fmt: v => fmt(v, 0), series: [
          { name: t("cause.berth"), data: S.q_berth, color: COLORS.cause.berth }, { name: t("cause.tide"), data: S.q_tide, color: COLORS.cause.tide },
          { name: t("cause.weather"), data: S.q_weather, color: COLORS.cause.weather }, { name: t("cause.day"), data: S.q_day, color: COLORS.cause.day },
          { name: t("cause.channel"), data: S.q_channel, color: COLORS.cause.channel }] }));
        // daily mean berth occupancy (%) per terminal – readable version of the hourly step series
        const nd = Math.ceil(n / 24), xd = Array.from({ length: nd }, (_, i) => d.t0 + i * 24);
        const daily = arr => Array.from({ length: nd }, (_, j) => { const seg = arr.slice(j * 24, j * 24 + 24); return seg.reduce((a, b) => a + b, 0) / (seg.length || 1); });
        charts.push(Charts.line(c2, { ...common, x: xd, height: 240, yMin: 0, fmt: v => fmt(v, 0) + "%",
          series: R.terminals.map((tm, i) => ({ name: tm.TerminalName, data: daily(S.termOcc[i]).map(v => 100 * v / Math.max(1, tm.BerthCount)), color: catColor(i) })),
          refs: [] }));
        const E = R.env; const m = Math.min(n, E.hs.length);
        const bad = E.hs.slice(0, m).map((v, i) => v > R.params["rules.maxWaveForHandling_m"] || E.wind[i] > R.params["rules.maxWindForHandling_ms"]);
        charts.push(Charts.line(c3, { ...common, x: x.slice(0, m), height: 200, fmt: v => fmt(v, 1), bands: [{ data: bad, color: "#C8413A", opacity: .07 }],
          series: [{ name: LANG === "vi" ? "Mực nước (m)" : "Water level (m)", data: E.waterLevel.slice(0, m), color: "#2E86AB" }, { name: "Hs (m)", data: E.hs.slice(0, m), color: "#7A5195" }] }));
      };
      sel.onchange = () => { store.set("tsRun", Number(sel.value)); draw(); };
      await draw();
    }

    if (sub === "arrivals") {
      const c1 = chartBox(230), c2 = chartBox(230), c3 = chartBox(230);
      body.append(h("div", { class: "grid g2" }, card(t("res.hod"), c1), card(t("res.monthlyCalls"), c2)), card(t("res.daily"), c3));
      Charts.bar(c1, { categories: K.hourOfDay.map((_, i) => pad(i)), series: [{ name: t("res.hod"), data: K.hourOfDay, color: "#2E86AB" }], legend: false, height: 230, fmt: v => fmt(v, 1) });
      Charts.bar(c2, { categories: MONTHS[LANG], series: [{ name: t("res.monthlyCalls"), data: K.monthlyCalls, color: "#0E9AA7" }], legend: false, height: 230, fmt: v => fmt(v, 0) });
      Charts.line(c3, { x: K.daily.map((_, i) => i * 24 + 1), series: [{ name: t("res.daily"), data: K.daily, color: "#0B3D5C", area: true }], xFmt: hoursXFmt, xTicks: timeTicks, legend: false, height: 230, yMin: 0, fmt: v => fmt(v, 1), tipTitle: v => fmtDate(v, false) });
    }

    if (sub === "kpi") {
      const tt = h("div");
      body.appendChild(card(t("res.tab.kpi"), tt));
      const nR = R.meta.nRuns;
      const dig = s => (s.unit === "t" || s.unit === "t/năm") ? 0 : s.id === "ws_ratio" ? 3 : 2;
      Grid.table(tt, {
        rows: K.summary, columns: [
          { key: "label", label: t("common.metric"), get: r => L(r) }, { key: "unit", label: t("common.unit") },
          { key: "mean", label: t("common.mean"), num: true, fmt: (v, r) => fmt(v, dig(r)) }, { key: "ci", label: t("res.ci"), num: true, fmt: (v, r) => fmt(v, dig(r)) },
          { key: "sd", label: t("res.sd"), num: true, fmt: (v, r) => fmt(v, dig(r)) }, { key: "min", label: "Min", num: true, fmt: (v, r) => fmt(v, dig(r)) }, { key: "max", label: "Max", num: true, fmt: (v, r) => fmt(v, dig(r)) },
          ...Array.from({ length: nR }, (_, i) => ({ key: "r" + i, label: `#${i + 1}`, num: true, get: r => r.runs[i], fmt: (v, r) => fmt(v, dig(r)) })),
        ],
      });
    }

    if (sub === "ships") {
      const sel = h("select", {}, R.runList.map(r => h("option", { value: r.runIndex }, `${t("common.run")} ${r.runIndex}`)));
      const fType = h("select", {}, h("option", { value: "" }, t("common.shipType") + ": " + t("res.filterAll")), K.shipTypes.map(x => h("option", { value: x.ShipTypeName }, x.ShipTypeName)));
      const fTerm = h("select", {}, h("option", { value: "" }, t("common.terminal") + ": " + t("res.filterAll")), R.terminals.map(x => h("option", { value: x.TerminalID }, x.TerminalName)));
      const fSt = h("select", {}, h("option", { value: "" }, t("common.status") + ": " + t("res.filterAll")), h("option", { value: "Served" }, t("res.served")), h("option", { value: "x" }, t("res.rejected")));
      const tt = h("div");
      body.append(h("div", { class: "filters" }, sel, fType, fTerm, fSt), tt);
      const tn = id => (R.terminals.find(x => x.TerminalID === id) || {}).TerminalName || id;
      const draw = async () => {
        const d = await App.detail(Number(sel.value));
        const rows = d.ships.filter(s => (!fType.value || s.ShipTypeName === fType.value) && (!fTerm.value || String(s.TerminalID) === fTerm.value) && (!fSt.value || (fSt.value === "Served" ? s.Served : !s.Served)));
        Grid.table(tt, {
          rows, pageSize: 50, columns: [
            { key: "CallID", label: "#", num: true, d: 0 }, { key: "ShipTypeName", label: t("common.shipType"), fmt: v => h("span", { class: "chip" }, h("i", { style: { background: App.typeColors[v] } }), v) },
            { key: "TerminalID", label: t("common.terminal"), fmt: v => tn(v) }, { key: "ETA_h", label: "ETA", fmt: v => fmtDate(v) },
            { key: "Cargo_t", label: LANG === "vi" ? "Hàng (t)" : "Cargo (t)", num: true, d: 0 },
            { key: "pre", label: t("k.prewait") + " (h)", num: true, get: s => WAIT_IN.reduce((a, k) => a + (s[k] || 0), 0) },
            { key: "WaitTideIn_h", label: t("cause.tide") + " (h)", num: true, get: s => s.WaitTideIn_h + s.WaitTideOut_h },
            { key: "HandlingDowntime_h", label: t("cause.down") + " (h)", num: true },
            { key: "NetHandling_h", label: (LANG === "vi" ? "Làm hàng" : "Handling") + " (h)", num: true },
            { key: "Turnaround_h", label: t("k.ta") + " (h)", num: true },
            { key: "Status", label: t("common.status"), fmt: (v, s) => h("span", { class: "badge " + (s.Served ? "ok" : "crit"), title: s.Reason }, s.Served ? v : (s.Reason || v)) },
          ],
        });
      };
      [sel, fType, fTerm, fSt].forEach(x => x.onchange = draw);
      await draw();
    }
  },

  /* ================================================================= GANTT */
  async gantt(view) {
    if (!needResult(view)) return;
    const R = App.result;
    const sel = h("select", {}, R.runList.map(r => h("option", { value: r.runIndex }, `${t("common.run")} ${r.runIndex}`)));
    const colorSel = h("select", {}, h("option", { value: "type" }, t("g.byType")), h("option", { value: "wait" }, t("g.byWait")));
    const holder = h("div");
    let G = null;
    const spanBtns = [["g.week", 168], ["g.month", 720], ["g.all", 0]].map(([k, v]) => h("button", { class: "btn-sm", onclick: () => G && G.span(v) }, t(k)));
    view.appendChild(pageHead(t("g.title"), t("g.lead"), [h("label", { class: "row small" }, t("res.selectRun"), sel), h("label", { class: "row small" }, t("g.colorBy"), colorSel), ...spanBtns]));
    const legend = h("div", { class: "legend-inline", style: { marginBottom: "10px" } });
    const typeLeg = () => { legend.innerHTML = ""; if (colorSel.value === "type") Object.entries(App.typeColors).forEach(([n, c]) => legend.append(h("span", {}, h("i", { style: { background: c } }), n))); else [0, 12, 24, 36, 48].forEach(v => legend.append(h("span", {}, h("i", { style: { background: Gantt.waitColor(v) } }), v === 48 ? "≥48 h" : v + " h"))); legend.append(h("span", {}, h("i", { style: { background: "repeating-linear-gradient(45deg,#8a949e 0 2px,transparent 2px 5px)" } }), t("g.reserved")), h("span", {}, h("i", { style: { background: "#9aa", opacity: .6 } }), t("g.berthing")), h("span", {}, h("i", { style: { background: "repeating-linear-gradient(45deg,#C8413A 0 2px,transparent 2px 5px)" } }), t("g.waitOut")), h("span", {}, h("i", { style: { background: "rgba(200,65,58,.35)" } }), t("g.weatherBand"))); };
    view.append(card(null, h("div", {}, legend, holder)));
    const draw = async () => {
      const d = await App.detail(Number(sel.value));
      G = Gantt.create(holder, {
        terminals: R.terminals, ships: d.ships, env: R.env, t0: d.t0, tStart: R.meta.measureStart, tEnd: R.meta.measureEnd,
        limits: { hs: R.params["rules.maxWaveForHandling_m"], wind: R.params["rules.maxWindForHandling_ms"] }, typeColors: App.typeColors,
      });
      G.setColorBy(colorSel.value); typeLeg();
    };
    sel.onchange = draw; colorSel.onchange = () => { G && G.setColorBy(colorSel.value); typeLeg(); };
    await draw();
  },

  /* ================================================================= ANIMATION */
  async animation(view) {
    if (!needResult(view)) return;
    const R = App.result;
    const sel = h("select", {}, R.runList.map(r => h("option", { value: r.runIndex }, `${t("common.run")} ${r.runIndex}`)));
    const playBtn = h("button", { class: "btn-primary" }, "▶ " + t("a.play"));
    const speedSel = h("select", {}, [1, 3, 6, 12, 24, 48, 96].map(v => h("option", { value: v, selected: v === 6 }, `${v} ${t("a.perSec")}`)));
    const slider = h("input", { type: "range", min: R.meta.measureStart, max: R.meta.measureEnd, step: 0.1, style: { flex: 1, minWidth: "200px" } });
    const busiest = h("button", {}, "⚑ " + t("a.busiest"));
    view.appendChild(pageHead(t("a.title"), null, [h("label", { class: "row small" }, t("res.selectRun"), sel)]));
    const wrap = h("div", { class: "canvas-wrap" }), side = h("div", { class: "anim-side" });
    view.append(card(null, h("div", { class: "row", style: { flexWrap: "nowrap" } }, playBtn, h("label", { class: "row small" }, t("a.speed"), speedSel), slider, busiest)),
      h("div", { style: { height: "12px" } }), h("div", { class: "grid g-side" }, wrap, side));
    let A = null;
    const draw = async () => {
      if (A) A.destroy();
      const d = await App.detail(Number(sel.value));
      const S = d.series;
      let best = 0, bi = 0;
      for (let i = 0; i < S.q_berth.length; i++) { const q = S.q_berth[i] + S.q_tide[i] + S.q_weather[i] + S.q_day[i] + S.q_channel[i]; if (q > best) { best = q; bi = i; } }
      busiest.onclick = () => { A.seek(d.t0 + bi - 12); slider.value = A.time; };
      A = PortAnim.create(wrap, side, {
        params: R.params, terminals: R.terminals, ships: d.ships, env: R.env, t0: d.t0, tStart: R.meta.measureStart, tEnd: R.meta.measureEnd + 200,
        typeColors: App.typeColors, startAt: store.get("animT", R.meta.measureStart + 24 * 10),
        onTime: x => { slider.value = x; },
        onState: on => { playBtn.textContent = on ? "❚❚ " + t("a.pause") : "▶ " + t("a.play"); },
      });
      A.setSpeed(Number(speedSel.value));
      slider.value = A.time;
    };
    playBtn.onclick = () => A && A.toggle();
    speedSel.onchange = () => A && A.setSpeed(Number(speedSel.value));
    slider.oninput = () => A && A.seek(Number(slider.value));
    sel.onchange = draw;
    await draw();
    App.cleanup = () => { if (A) { store.set("animT", A.time); A.destroy(); } };
  },

  /* ================================================================= SCENARIOS */
  async scenarios(view) {
    view.appendChild(pageHead(t("sc.title"), t("sc.lead")));
    if (App.result) {
      const nm = h("input", { value: App.result.name, style: { flex: 1, minWidth: "180px" } });
      const note = h("input", { placeholder: t("sc.note"), style: { flex: 2, minWidth: "200px" } });
      view.appendChild(card(t("sc.saveCur"), h("div", { class: "row" }, nm, note, h("button", {
        class: "btn-primary", onclick: async () => {
          try { await API.post("api/scenarios", { runId: App.runId, name: nm.value, note: note.value }); toast(t("sc.saved")); App.route(); } catch (e) { toast(e.message, true); }
        },
      }, "＋ " + t("common.save")))));
      view.appendChild(h("div", { style: { height: "16px" } }));
    }
    const list = await API.get("api/scenarios");
    if (!list.length) { view.appendChild(card(t("sc.list"), h("p", { class: "muted" }, t("sc.none")))); return; }
    const chosen = new Set(store.get("scSel", list.map(x => x.id)).filter(id => list.some(x => x.id === id)));
    const listEl = h("div"), cmp = h("div", { class: "stack" });
    view.append(card(t("sc.list"), listEl), h("div", { style: { height: "16px" } }), cmp);
    const renderList = () => {
      Grid.table(listEl, {
        rows: list, columns: [
          { key: "sel", label: "", fmt: (_, r) => { const c = h("input", { type: "checkbox", checked: chosen.has(r.id) }); c.onclick = e => e.stopPropagation(); c.onchange = () => { c.checked ? chosen.add(r.id) : chosen.delete(r.id); store.set("scSel", [...chosen]); renderCmp(); }; return c; } },
          { key: "name", label: t("sc.name") }, { key: "note", label: t("sc.note") }, { key: "created", label: t("run.col.created") },
          { key: "act", label: "", fmt: (_, r) => h("span", { class: "row", style: { gap: "4px", flexWrap: "nowrap" } },
            h("button", { class: "btn-sm", onclick: async () => { const d = await API.get(`api/scenarios/${r.id}`); App.inputs = { ...App.inputs, ...d.inputs }; App.saveInputs(); toast(t("sc.loaded")); } }, t("sc.load")),
            h("button", { class: "btn-sm btn-danger", onclick: async () => { await API.del(`api/scenarios/${r.id}`); App.route(); } }, "✕")) },
        ],
      });
    };
    const renderCmp = () => {
      cmp.innerHTML = "";
      const sc = list.filter(x => chosen.has(x.id));
      if (!sc.length) { cmp.appendChild(card(t("sc.compare"), h("p", { class: "muted" }, t("sc.pick")))); return; }
      const ids = ["throughput_annual_t", "service_level", "mean_turnaround_h", "p90_turnaround_h", "mean_prewait_h", "ws_ratio", "berth_occupancy", "channel_utilization", "mean_anchorage_queue",
        "WaitBerth_h", "WaitTideIn_h", "WaitChannelIn_h", "HandlingDowntime_h", "WaitTideOut_h"];
      const lowerBetter = new Set(["mean_turnaround_h", "p90_turnaround_h", "mean_prewait_h", "ws_ratio", "mean_anchorage_queue", "WaitBerth_h", "WaitTideIn_h", "WaitChannelIn_h", "HandlingDowntime_h", "WaitTideOut_h"]);
      const get = (s, id) => (s.summary.find(x => x.id === id) || {});
      const tbl = h("table", { class: "t" });
      tbl.appendChild(h("thead", {}, h("tr", {}, h("th", {}, t("common.metric")), h("th", {}, t("common.unit")), sc.map((s, i) => h("th", { class: "n" }, s.name, i === 0 ? h("div", { class: "small muted" }, t("sc.base")) : null)))));
      const tb = h("tbody");
      ids.forEach(id => {
        const vals = sc.map(s => get(s, id).mean ?? null);
        const def = get(sc[0], id);
        const fin = vals.filter(v => v != null);
        const best = lowerBetter.has(id) ? Math.min(...fin) : Math.max(...fin), worst = lowerBetter.has(id) ? Math.max(...fin) : Math.min(...fin);
        const d = id.includes("_t") && !id.includes("turnaround") ? 0 : id === "ws_ratio" ? 3 : 1;
        tb.appendChild(h("tr", {}, h("td", {}, L(def)), h("td", { class: "muted" }, def.unit || ""), vals.map((v, i) => {
          const delta = i > 0 && vals[0] ? (v - vals[0]) / Math.abs(vals[0]) * 100 : null;
          return h("td", { class: "n " + (sc.length > 1 && v === best && best !== worst ? "best" : sc.length > 1 && v === worst && best !== worst ? "worst" : "") },
            v == null ? "–" : (d === 0 ? fmt(v, 0) : fmt(v, d)), delta != null && isFinite(delta) ? h("span", { class: "small muted" }, ` (${delta > 0 ? "+" : ""}${fmt(delta, 1)}%)`) : null);
        })));
      });
      tbl.appendChild(tb);
      cmp.appendChild(card(t("sc.compare"), h("div", { class: "table-wrap" }, tbl)));
      const c1 = chartBox(260), c2 = chartBox(260), c3 = chartBox(260);
      cmp.appendChild(h("div", { class: "grid g3" }, card(t("k.ta") + " (h)", c1), card(t("k.throughput") + " (t)", c2), card(t("sc.occTerm") + " (%)", c3)));
      const names = sc.map(s => s.name); const rot = names.some(n => n.length > 14) || names.length > 3;
      Charts.bar(c1, { categories: names, height: 280, rotate: rot, stacked: true, fmt: v => fmt(v, 0), tipFmt: v => fmt(v, 1),
        series: [["mean_prewait_h", t("k.prewait"), "#E4572E"], ["mean_berth_time_h", LANG === "vi" ? "Tại bến" : "At berth", "#0B3D5C"]].map(([id, n, c]) => ({ name: n, color: c, data: sc.map(s => get(s, id).mean || 0) })) });
      Charts.bar(c2, { categories: names, height: 280, rotate: rot, legend: false, series: [{ name: t("k.throughput"), data: sc.map(s => get(s, "throughput_annual_t").mean || 0), color: "#0E9AA7" }], valueLabels: true });
      const terms = [...new Set(sc.flatMap(s => s.terminals.map(x => x.TerminalName)))];
      Charts.bar(c3, { categories: terms, height: 260, fmt: v => fmt(v, 0), tipFmt: v => fmt(v, 1) + "%",
        series: sc.map((s, i) => ({ name: s.name, color: catColor(i), data: terms.map(tn => (s.terminals.find(x => x.TerminalName === tn) || {}).BerthOccupancy || 0) })) });
    };
    renderList(); renderCmp();
  },

  /* ================================================================= HELP */
  help(view) {
    view.appendChild(pageHead(t("h.title")));
    const vi = LANG === "vi";
    const html = vi ? `
<h2>1. Phương pháp mô phỏng</h2>
<p>Mô hình mô phỏng rời rạc theo bước thời gian <b>Δt</b> (mặc định 0,1 h = 6 phút). Tại mỗi bước, toàn bộ tài nguyên (luồng, vị trí bến, chiều dài cầu cảng, cẩu) được cấp phát theo đúng trình tự nhân quả, và mỗi tàu đang chờ được quy cho <b>đúng một nguyên nhân chờ</b>. Mỗi lần chạy (replication) sinh lịch tàu đến và năng suất ngẫu nhiên độc lập; KPI báo cáo trung bình ± nửa khoảng tin cậy 95% (phân phối t).</p>
<h3>Trình tự một lượt tàu</h3>
<ol><li>Tàu đến vùng neo tại ETA (Poisson / Erlang-k / theo lịch ± sai lệch / tất định; có hệ số mùa vụ và hệ số tăng trưởng).</li>
<li>Chờ được phân bến (nếu <code>policy.berthBeforeChannel = 1</code>): bến trống, đủ chiều dài cầu <code>LOA×(1+clearance)</code>, đủ cẩu, đủ độ sâu trước bến; có thể chuyển sang terminal dự phòng.</li>
<li>Chờ cửa sổ hành hải trên <b>toàn bộ hành trình</b> qua luồng: mực nước, sóng/gió, ban ngày (tàu lớn) → chờ triều / thời tiết / ban ngày.</li>
<li>Chờ điều tiết luồng (một chiều, hai chiều, quy tắc bề rộng), giãn cách cùng/ngược chiều, chính sách ưu tiên → chờ luồng.</li>
<li>Cập bến → làm hàng; khi Hs hoặc gió vượt ngưỡng, làm hàng dừng (<b>dừng làm hàng do thời tiết</b>) và tàu vẫn chiếm bến.</li>
<li>Rời bến → chờ cửa sổ ra (triều/thời tiết/luồng) <b>trong khi vẫn chiếm bến</b> → đi luồng ra.</li></ol>
<h3>Công thức chính</h3>
<div class="formula">Độ sâu khả dụng(t) = H_luồng + WL(t) − k_sóng·Hs(t) ≥ T + UKC_min + Squat</div>
<div class="formula">Squat (Barrass) = Cb · V²(knot) / 100 × hệ số squat (1 = vùng mở, 2 = luồng hẹp)</div>
<div class="formula">Thời gian làm hàng = Q / (P · ε),   Q = LoadFactor × DWT,   ε ~ Lognormal(1, CV)</div>
<div class="formula">P = ServiceRate_tph (năng suất bến)  hoặc  n_cẩu × CraneRate_tph × k^(n−1)</div>
<div class="formula">Quay vòng = Chờ trước bến + Hành trình vào + Thời gian tại bến + Hành trình ra</div>
<h3>Chính sách ưu tiên luồng</h3>
<p><code>fifo</code>: tàu yêu cầu trước được đi trước; khi tàu đầu hàng bị chặn bởi tàu ngược chiều, nó <b>giữ chiều</b> để tránh tàu cùng chiều với dòng đang chạy chen lên (tránh “đói” luồng). <code>inbound_first</code> / <code>outbound_first</code>: chỉ tàu vào / ra mới được giữ chiều. <code>large_first</code>: ưu tiên tàu có LOA lớn.</p>
<h2>2. Chỉ tiêu đánh giá</h2>
<table class="t"><tr><th>Chỉ tiêu</th><th>Định nghĩa</th></tr>
<tr><td>Chiếm dụng bến</td><td>Thời gian vị trí bến bị giữ / (số bến × thời gian đo), gồm cả thời gian chờ triều/luồng tại bến</td></tr>
<tr><td>Bến đang làm hàng</td><td>Chỉ tính thời gian đang bốc xếp thực tế</td></tr>
<tr><td>W/S</td><td>Chờ trước bến trung bình / thời gian tại bến trung bình (UNCTAD). Tham khảo: container ≤ 0,1–0,2; hàng tổng hợp ≤ 0,5</td></tr>
<tr><td>P90 / P95</td><td>90% / 95% số lượt tàu có thời gian quay vòng không vượt quá giá trị này</td></tr>
<tr><td>Tiếp cận triều</td><td>Tỷ lệ thời gian cửa sổ hành hải mở cho loại tàu (vào/ra)</td></tr></table>
<h3>Ngưỡng chiếm dụng bến khuyến nghị (UNCTAD)</h3>
<table class="t"><tr><th>Số bến trong nhóm</th><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6–10</td></tr><tr><th>Chiếm dụng tối đa</th><td>40%</td><td>50%</td><td>55%</td><td>60%</td><td>65%</td><td>70%</td></tr></table>
<h2>3. Quy trình sử dụng</h2>
<ol><li><b>Dữ liệu đầu vào</b>: nạp Excel (6 file định dạng cũ hoặc workbook gộp) hoặc chỉnh sửa trực tiếp. Tab <i>Kiểm tra & năng lực</i> cho kết quả kiểm tra và ước tính giải tích nhanh.</li>
<li><b>Chạy mô phỏng</b>: đặt tên kịch bản, bấm Chạy. Theo dõi tiến độ và nhật ký.</li>
<li><b>Tổng quan</b>: KPI chính kèm khoảng tin cậy, cảnh báo tự động theo UNCTAD và W/S.</li>
<li><b>Kết quả chi tiết</b>, <b>Lịch bến</b>, <b>Hoạt hình</b> để phân tích nút thắt.</li>
<li><b>So sánh kịch bản</b>: lưu kết quả các phương án và so sánh song song; có thể nạp lại đầu vào của một kịch bản.</li>
<li>Xuất báo cáo Excel (đã định dạng, có biểu đồ) hoặc JSON.</li></ol>
<h2>4. Tương thích với v1.5.1</h2>
<p>Toàn bộ khóa tham số và cột dữ liệu cũ được giữ nguyên. Để tái lập logic cũ: <code>policy.berthBeforeChannel=0</code>, <code>service.productivityCV=0</code>, <code>policy.berthClearanceRatio=0</code>, <code>policy.berthingTime_h=2</code>, <code>policy.unberthingTime_h=0</code>, <code>policy.maxAnchorageWait_h=0</code>, <code>sim.warmup_h=0</code>. Khác biệt còn lại là do dừng làm hàng vì thời tiết trong khi làm hàng (bản cũ chỉ kiểm tra lúc bắt đầu).</p>
<p class="small">Tài liệu phương pháp gốc: <a href="https://doi.org/10.13140/RG.2.2.20605.63202" target="_blank" rel="noopener">doi:10.13140/RG.2.2.20605.63202</a></p>`
      : `
<h2>1. Simulation method</h2>
<p>Time-sliced discrete-event simulation with step <b>Δt</b> (default 0.1 h). At every step all resources (channel, berth positions, quay length, cranes) are allocated causally and each waiting ship is attributed to <b>exactly one waiting cause</b>. Each replication draws independent arrivals and productivities; KPIs are reported as mean ± 95% confidence half-width (t-distribution).</p>
<h3>Call sequence</h3>
<ol><li>Arrival at anchorage (Poisson / Erlang-k / scheduled ± ETA deviation / deterministic; seasonality and demand growth).</li>
<li>Berth assignment (if <code>policy.berthBeforeChannel = 1</code>): free berth, quay length <code>LOA×(1+clearance)</code>, cranes, berth depth; alternative terminal.</li>
<li>Navigation window over the <b>whole transit</b>: water level, waves/wind, daylight for large ships.</li>
<li>Channel control (one-way, two-way, beam rule), headways and priority policy.</li>
<li>Berthing → cargo handling, stopped when Hs or wind exceed limits (the ship keeps the berth).</li>
<li>Unberthing → waiting for the outbound window <b>while occupying the berth</b> → outbound transit.</li></ol>
<div class="formula">Available depth(t) = D_channel + WL(t) − k_wave·Hs(t) ≥ T + UKC_min + Squat</div>
<div class="formula">Squat (Barrass) = Cb · V²(kn) / 100 × squat factor</div>
<div class="formula">Handling time = Q / (P · ε),  Q = LoadFactor × DWT,  ε ~ Lognormal(1, CV)</div>
<h2>2. Indicators</h2>
<p>Berth occupancy (incl. waiting at berth), berth working ratio, quay and crane utilisation, W/S ratio (UNCTAD), P90/P95 turnaround, tidal accessibility, channel utilisation, anchorage queue. UNCTAD recommended maximum occupancy: 1 berth 40%, 2: 50%, 3: 55%, 4: 60%, 5: 65%, 6–10: 70%.</p>
<h2>3. Compatibility with v1.5.1</h2>
<p>All legacy keys and columns are supported. To reproduce the legacy logic set <code>policy.berthBeforeChannel=0</code>, <code>service.productivityCV=0</code>, <code>policy.berthClearanceRatio=0</code>, <code>policy.berthingTime_h=2</code>, <code>policy.unberthingTime_h=0</code>, <code>policy.maxAnchorageWait_h=0</code>, <code>sim.warmup_h=0</code>.</p>
<p class="small">Method reference: <a href="https://doi.org/10.13140/RG.2.2.20605.63202" target="_blank" rel="noopener">doi:10.13140/RG.2.2.20605.63202</a></p>`;
    view.appendChild(h("div", { class: "card prose", html }));
  },
};
