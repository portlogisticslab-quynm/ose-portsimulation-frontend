/* Editable data grid and read-only sortable table */
const Grid = (() => {
  function editable(el, opt) {
    const render = () => {
      el.innerHTML = "";
      const cols = opt.columns.filter(c => c.required || opt.showOptional());
      const tbl = h("table", { class: "t grid-edit" });
      const thead = h("tr", {}, cols.map(c => h("th", { class: (c.required ? "" : "opt ") + (c.type !== "str" ? "n" : ""), title: c.name },
        L(c), c.unit ? h("span", { class: "unit" }, ` (${c.unit})`) : null, h("div", { class: "mono small muted", style: { fontWeight: 400 } }, c.name))), h("th", {}));
      tbl.appendChild(h("thead", {}, thead));
      const tb = h("tbody");
      opt.rows().forEach((row, ri) => {
        const tr = h("tr");
        cols.forEach(c => {
          const v = row[c.name];
          const inp = h("input", {
            value: v === null || v === undefined ? "" : v,
            type: c.type === "str" ? "text" : "number", step: c.type === "int" ? "1" : "any",
            style: { textAlign: c.type === "str" ? "left" : "right" },
            placeholder: c.required ? "" : "–",
          });
          const td = h("td", { class: (c.required ? "" : "opt") }, inp);
          const check = () => { td.classList.toggle("bad", opt.validate ? !opt.validate(row, c) : false); };
          inp.addEventListener("change", () => {
            let nv = inp.value.trim();
            if (nv === "") nv = null;
            else if (c.type === "int") nv = Math.round(Number(nv));
            else if (c.type === "float") nv = Number(nv);
            row[c.name] = nv; check(); opt.onChange && opt.onChange();
          });
          inp.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
              const idx = Array.from(tr.children).indexOf(td);
              const nextTr = e.key === "ArrowUp" ? tr.previousElementSibling : tr.nextElementSibling;
              if (nextTr) { e.preventDefault(); inp.dispatchEvent(new Event("change")); nextTr.children[idx].querySelector("input").focus(); }
            }
          });
          check();
          tr.appendChild(td);
        });
        tr.appendChild(h("td", { class: "act" },
          h("button", { title: t("common.dup"), onclick: () => { const rows = opt.rows(); const copy = { ...row }; if (opt.idField) copy[opt.idField] = Math.max(0, ...rows.map(r => r[opt.idField] || 0)) + 1; rows.splice(ri + 1, 0, copy); opt.onChange && opt.onChange(); render(); } }, "⧉"),
          h("button", { title: t("common.delete"), onclick: () => { opt.rows().splice(ri, 1); opt.onChange && opt.onChange(); render(); } }, "✕")));
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      el.appendChild(h("div", { class: "table-wrap" }, tbl));
      el.appendChild(h("div", { class: "row", style: { marginTop: "10px" } },
        h("button", { class: "btn-sm", onclick: () => { const rows = opt.rows(); const nr = opt.newRow ? opt.newRow(rows) : {}; rows.push(nr); opt.onChange && opt.onChange(); render(); } }, "+ " + t("common.add"))));
    };
    render();
    return { render };
  }

  /* Read-only table. columns: [{key,label,num,d,fmt,cls(row)}] */
  function table(el, opt) {
    let sortKey = opt.sortKey || null, dir = opt.sortDir || 1, page = 0;
    const size = opt.pageSize || 0;
    const render = () => {
      el.innerHTML = "";
      let rows = opt.rows.slice();
      if (sortKey) {
        const col = opt.columns.find(c => c.key === sortKey);
        const get = col && col.sortVal ? col.sortVal : (r => r[sortKey]);
        rows.sort((a, b) => { const x = get(a), y = get(b); if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
      }
      const total = rows.length;
      if (size) rows = rows.slice(page * size, page * size + size);
      const tbl = h("table", { class: "t" });
      tbl.appendChild(h("thead", {}, h("tr", {}, opt.columns.map(c => {
        const th = h("th", { class: (c.num ? "n " : "") + "sortable", title: c.title || "" }, c.label, sortKey === c.key ? (dir > 0 ? " ▲" : " ▼") : "");
        th.onclick = () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = c.num ? -1 : 1; } render(); };
        return th;
      }))));
      const tb = h("tbody");
      rows.forEach(r => {
        tb.appendChild(h("tr", { onclick: opt.onRow ? () => opt.onRow(r) : null, style: opt.onRow ? { cursor: "pointer" } : null },
          opt.columns.map(c => {
            const v = c.get ? c.get(r) : r[c.key];
            const txt = c.fmt ? c.fmt(v, r) : (c.num ? fmt(v, c.d ?? 1) : (v ?? "–"));
            const td = h("td", { class: (c.num ? "n " : "") + (c.cls ? c.cls(r) || "" : "") });
            if (txt instanceof Node) td.appendChild(txt); else td.textContent = txt;
            return td;
          })));
      });
      tbl.appendChild(tb);
      el.appendChild(h("div", { class: "table-wrap", style: opt.maxHeight ? { maxHeight: opt.maxHeight } : null }, tbl));
      if (size && total > size) {
        const pages = Math.ceil(total / size);
        el.appendChild(h("div", { class: "pager" },
          `${t("common.showing")} ${page * size + 1}–${Math.min(total, (page + 1) * size)} ${t("common.of")} ${total}`,
          h("button", { class: "btn-sm", disabled: page === 0, onclick: () => { page--; render(); } }, t("common.prev")),
          h("button", { class: "btn-sm", disabled: page >= pages - 1, onclick: () => { page++; render(); } }, t("common.next"))));
      }
    };
    render();
    return { render, setRows(r) { opt.rows = r; page = 0; render(); } };
  }
  return { editable, table };
})();
