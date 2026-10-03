/* OSE backend selector: home server first, Render as fallback. */
(function () {
  if (window.oseFetch) return; // already loaded
  const BACKENDS = {
    home:   "https://port-simulation.ose.vn",
    render: "https://ose-portsimulation-backend.onrender.com",
    local:  "http://127.0.0.1:8006",
  };
  const CACHE_KEY = "ose_api_auto";
  const CACHE_MS = 5 * 60 * 1000;
  let auto = false;
  const set = (base) => (window.OSE_API_BASE = base);
  window.OSE_BACKENDS = BACKENDS;

  // The Flask backend also serves this frontend (run_windows.bat, Docker, the Render URL, the -home host).
  // In that case the API is on the same origin and no selection is needed.
  const h = location.hostname, p = location.port;
  const sameOrigin = location.protocol.startsWith("http") && (
    (["localhost", "127.0.0.1"].includes(h) && p !== "5500") ||
    h.endsWith(".onrender.com") || h.endsWith("-home.ose.vn") || h === new URL(BACKENDS.home).hostname);
  window.OSE_SAME_ORIGIN = sameOrigin;

  function remember(name) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ name, t: Date.now() })); } catch (e) {}
  }
  function recalled() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (c && BACKENDS[c.name] && Date.now() - c.t < CACHE_MS) return c.name;
    } catch (e) {}
    return null;
  }
  async function alive(base, ms) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { return (await fetch(base + "/api/health", { signal: c.signal, cache: "no-store" })).ok; }
    catch (e) { return false; } finally { clearTimeout(t); }
  }

  function resolve() {
    if (sameOrigin) return Promise.resolve(set(location.origin));
    if (["localhost", "127.0.0.1"].includes(h)) return Promise.resolve(set(BACKENDS.local));
    // ?api=home | render | local (ghim)   ?api=auto (bỏ ghim)
    let forced = new URLSearchParams(location.search).get("api");
    try {
      if (forced === "auto") { localStorage.removeItem("ose_api"); forced = null; }
      else if (forced && BACKENDS[forced]) localStorage.setItem("ose_api", forced);
      else if (forced) forced = null;
      else forced = localStorage.getItem("ose_api");
    } catch (e) {}
    if (forced && BACKENDS[forced]) return Promise.resolve(set(BACKENDS[forced]));

    auto = true;
    const cached = recalled();
    if (cached) return Promise.resolve(set(BACKENDS[cached]));
    set(BACKENDS.home);
    return (async () => {
      if (await alive(BACKENDS.home, 4000)) { remember("home"); return BACKENDS.home; }
      console.warn("[OSE] Máy chủ chính không phản hồi, chuyển sang Render");
      remember("render");
      return set(BACKENDS.render);
    })();
  }

  window.OSE_API_READY = resolve();

  // Dùng thay cho fetch(): oseFetch("/api/xxx", options). Home chết giữa phiên -> gửi lại sang Render.
  window.oseFetch = async function (path, options) {
    const base = await window.OSE_API_READY;
    const canFailover = auto && base === BACKENDS.home;
    try {
      const res = await fetch(base + path, options);
      if (!canFailover || ![502, 503, 504].includes(res.status)) return res;
    } catch (e) {
      if (!canFailover) throw e;
    }
    console.warn("[OSE] Máy chủ chính mất kết nối, chuyển sang Render");
    remember("render");
    window.OSE_API_READY = Promise.resolve(set(BACKENDS.render));
    return fetch(BACKENDS.render + path, options);
  };
})();
