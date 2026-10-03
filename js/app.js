/* Application state, router and chrome */
const App = {
  schema: null,
  inputs: null,
  runs: [],
  runId: null,
  result: null,
  details: {},
  page: null,
  cleanup: null,

  async init() {
    setLang(LANG);
    document.documentElement.dataset.theme = store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    $$("#langSeg button").forEach(b => { b.classList.toggle("on", b.dataset.lang === LANG); b.onclick = () => { setLang(b.dataset.lang); $$("#langSeg button").forEach(x => x.classList.toggle("on", x === b)); this.refreshRunSelect(); if (this.ready) this.route(); }; });
    $("#themeBtn").onclick = () => { const th = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = th; store.set("theme", th); if (this.ready) this.route(); };
    $("#menuBtn").onclick = () => $("#sidebar").classList.toggle("open");
    $("#nav").addEventListener("click", () => $("#sidebar").classList.remove("open"));
    $("#runSelect").onchange = e => this.openRun(e.target.value);
    window.addEventListener("hashchange", () => this.ready && this.route());
    this.initBackendSelect();
    $("#view").innerHTML = `<div class="card"><h2>${esc(t("srv.connecting"))}</h2><p class="muted">${esc(t("srv.waking"))}</p></div>`;
    try {
      await window.OSE_API_READY;
      await this.ping();
      this.schema = await API.get("api/schema");
    } catch (e) {
      this.setServer(false);
      $("#view").innerHTML = `<div class="card"><h2>${esc(t("srv.off"))} — ${esc(backendName())}</h2><p class="muted">${esc(t("srv.offHelp"))}</p><p class="small muted">${esc(window.OSE_API_BASE || "")} · ${esc(e.message)}</p></div>`;
      return;
    }
    this.inputs = store.get("inputs", null);
    if (!this.inputs || !this.inputs.fleet) await this.loadDemo(true);
    await this.refreshRuns();
    const want = store.get("runId", null);
    const pick = this.runs.find(r => r.id === want && r.status === "done") || this.runs.find(r => r.status === "done");
    if (pick) await this.openRun(pick.id, true).catch(() => {});
    this.ready = true;
    this.route();
    setInterval(() => this.ping().catch(() => {}), 30000);
  },

  /* Backend selector: Auto (home → Render) / Home server / Render — same behaviour as channel-simulation */
  initBackendSelect() {
    const sel = $("#apiSelect"), wrap = $("#apiPicker");
    if (!sel) return;
    if (window.OSE_SAME_ORIGIN || ["localhost", "127.0.0.1"].includes(location.hostname)) { wrap.hidden = true; return; }
    let pinned = new URLSearchParams(location.search).get("api");
    try { pinned = pinned || localStorage.getItem("ose_api"); } catch (e) { /* ignore */ }
    sel.value = ["home", "render"].includes(pinned) ? pinned : "auto";
    sel.onchange = () => { const u = new URL(location.href); u.searchParams.set("api", sel.value); location.href = u.toString(); };
  },
  async ping() {
    const t0 = performance.now();
    try {
      const hh = await API.get("api/health");
      this.server = { ok: true, version: hh.version, instance: hh.instance, ms: Math.round(performance.now() - t0) };
      this.setServer(true);
      return hh;
    } catch (e) { this.server = { ok: false }; this.setServer(false); throw e; }
  },
  setServer(on) {
    const el = $("#serverState"); el.className = "server-state " + (on ? "on" : "off");
    const sv = this.server || {};
    el.textContent = backendName() + " · " + (on ? `v${sv.version || "?"}${sv.ms != null ? " · " + sv.ms + " ms" : ""}` : t("srv.offline"));
    el.title = (window.OSE_API_BASE || "") + " — " + t(on ? "srv.on" : "srv.off");
  },

  async loadDemo(silent) {
    this.inputs = await API.get("api/inputs/demo");
    this.saveInputs();
    if (!silent) toast(t("in.imported") + ": demo");
  },
  saveInputs() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => store.set("inputs", this.inputs), 300);
  },

  async refreshRuns() {
    try { this.runs = await API.get("api/runs"); } catch (e) { this.runs = []; }
    this.refreshRunSelect();
  },
  refreshRunSelect() {
    const sel = $("#runSelect"); sel.innerHTML = "";
    const done = this.runs.filter(r => r.status === "done");
    if (!done.length) sel.appendChild(h("option", { value: "" }, t("top.noResult")));
    done.forEach(r => sel.appendChild(h("option", { value: r.id, selected: r.id === this.runId }, `${r.name} · ${r.created.slice(5, 16)}`)));
  },
  async openRun(id, silent) {
    if (!id) return;
    this.result = await API.get(`api/runs/${id}/result`);
    this.runId = id; this.details = {};
    store.set("runId", id);
    this.typeColors = {};
    (this.result.fleet || []).forEach((f, i) => { this.typeColors[f.ShipTypeName] = catColor(i); });
    this.refreshRunSelect();
    if (!silent) this.route();
  },
  async detail(k) {
    if (!this.details[k]) this.details[k] = await API.get(`api/runs/${this.runId}/detail/${k}`);
    return this.details[k];
  },

  route() {
    TT.hide();
    if (this.cleanup) { try { this.cleanup(); } catch (e) { /* ignore */ } this.cleanup = null; }
    const [page, sub] = (location.hash.replace(/^#\//, "") || "dashboard").split("/");
    const fn = Pages[page] || Pages.dashboard;
    this.page = page;
    $$("#nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
    $("#crumb").innerHTML = esc(t("nav." + (Pages[page] ? page : "dashboard"))) + (this.result && ["dashboard", "results", "gantt", "animation"].includes(page) ? `<span class="sub">${esc(this.result.name)}</span>` : "");
    const view = $("#view"); view.innerHTML = "";
    window.scrollTo(0, 0);
    Promise.resolve(fn(view, sub)).catch(e => { console.error(e); view.appendChild(h("div", { class: "alert crit" }, h("span", { class: "dot" }), e.message)); });
  },
};
window.addEventListener("DOMContentLoaded", () => App.init());
