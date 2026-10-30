// The "Search entries" page: full-text search, filters and sorting over window.KB_SEARCH.
// The current search is kept in the address, so a search can be bookmarked or shared.
(function () {
  const { search, highlight, snippet, facets, escHtml: esc } = window.KBSearch;
  const ENTRIES = window.KB_SEARCH;
  const PREFIX = document.body.dataset.prefix || "";
  const TYPE_NAME = { issue: "Issue", learning: "Learning", explainer: "Explainer" };
  const $ = id => document.getElementById(id);
  const els = { q: $("s-q"), topic: $("s-topic"), tag: $("s-tag"), by: $("s-by"), status: $("s-status"), sort: $("s-sort"), count: $("s-count"), results: $("results"), clear: $("s-clear") };
  const typeChips = [...document.querySelectorAll(".chip[data-type]")];

  // Fill the dropdowns from the entries themselves
  const f = facets(ENTRIES);
  const fill = (sel, list, all) => { sel.innerHTML = `<option value="">${all}</option>` + list.map(([v, n]) => `<option value="${esc(v)}">${esc(v)} (${n})</option>`).join(""); };
  fill(els.topic, f.topics, "All top tags");
  fill(els.tag, f.tags, "All tags");
  fill(els.by, f.contributors, "Anyone");

  // Read the search from the address
  const params = new URLSearchParams(location.search);
  els.q.value = params.get("q") || "";
  const setSel = (sel, v) => { if (v && ![...sel.options].some(o => o.value === v)) sel.add(new Option(v, v)); sel.value = v || ""; };
  setSel(els.topic, params.get("topic"));
  setSel(els.tag, params.get("tag"));
  setSel(els.by, params.get("by"));
  els.status.value = params.get("status") || "";
  els.sort.value = params.get("sort") || "best";
  const types = new Set((params.get("type") || "").split(",").filter(t => TYPE_NAME[t]));
  typeChips.forEach(c => c.setAttribute("aria-pressed", String(types.has(c.dataset.type))));

  function currentFilters() {
    const t = new Set(typeChips.filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.dataset.type));
    return {
      types: t.size ? t : null,
      statuses: els.status.value ? new Set([els.status.value]) : null,
      topic: els.topic.value, tag: els.tag.value, contributor: els.by.value,
    };
  }

  function saveToAddress(fl) {
    const p = new URLSearchParams();
    if (els.q.value.trim()) p.set("q", els.q.value.trim());
    if (fl.types) p.set("type", [...fl.types].join(","));
    if (els.status.value) p.set("status", els.status.value);
    if (fl.topic) p.set("topic", fl.topic);
    if (fl.tag) p.set("tag", fl.tag);
    if (fl.contributor) p.set("by", fl.contributor);
    if (els.sort.value !== "best") p.set("sort", els.sort.value);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
    els.clear.hidden = !qs;
  }

  const keyClass = e => e.type === "issue" ? (e.status === "open" ? "issue-open" : "issue") : e.type;
  function card(r) {
    const e = r.entry;
    const status = e.status ? ` · ${e.status === "open" ? "Open" : "Resolved"}` : "";
    return `<li class="result">
      <a class="result-title" href="${PREFIX}${esc(e.url)}"><span class="k ${keyClass(e)}"></span><span>${highlight(e.title, r.found)}</span></a>
      <p class="result-meta">${TYPE_NAME[e.type]}${status} · ${esc(e.topic)}${e.updated ? ` · Updated ${esc(e.updated)}` : ""}</p>
      <p class="result-snippet">${snippet(e, r.found)}</p>
      ${e.tags && e.tags.length ? `<p class="result-tags">${e.tags.map(t => `<button type="button" class="tag" data-tag="${esc(t)}">${highlight(t, r.found)}</button>`).join("")}</p>` : ""}
    </li>`;
  }

  function run() {
    const fl = currentFilters();
    const { results, parsed } = search(ENTRIES, els.q.value, fl);
    const sort = els.sort.value;
    if (sort === "az" || (sort === "best" && parsed.empty)) results.sort((a, b) => a.entry.title.localeCompare(b.entry.title));
    if (sort === "new") results.sort((a, b) => String(b.entry.updated || "").localeCompare(String(a.entry.updated || "")) || a.entry.title.localeCompare(b.entry.title));
    saveToAddress(fl);

    const n = results.length;
    const filtered = fl.types || fl.statuses || fl.topic || fl.tag || fl.contributor;
    els.count.textContent = parsed.empty
      ? `${n} ${n === 1 ? "entry" : "entries"}${filtered ? " match these filters" : ""}`
      : `${n} result${n === 1 ? "" : "s"} for “${els.q.value.trim()}”`;

    if (!n) {
      els.results.innerHTML = `<div class="empty"><p>Nothing matches.</p><ul>
        <li>Try fewer or shorter words, like <b>charg</b> instead of <b>chargers</b>.</li>
        ${filtered ? `<li><button type="button" class="linkish" data-clear-filters>Clear the filters</button> and search everything.</li>` : ""}
        <li>Can't find it? <a href="${PREFIX}contribute/">Add it to the knowledge base</a>.</li></ul></div>`;
      return;
    }
    // With no search words and the default order, group entries under their top tag
    if (parsed.empty && sort === "best") {
      const groups = new Map();
      results.forEach(r => { if (!groups.has(r.entry.topic)) groups.set(r.entry.topic, []); groups.get(r.entry.topic).push(r); });
      els.results.innerHTML = [...groups].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([t, rs]) => `<section class="group"><h2>${esc(t)}</h2><ul class="results">${rs.map(card).join("")}</ul></section>`).join("");
    } else {
      els.results.innerHTML = `<ul class="results">${results.map(card).join("")}</ul>`;
    }
  }

  let timer;
  els.q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 120); });
  [els.topic, els.tag, els.by, els.status, els.sort].forEach(s => s.addEventListener("change", run));
  typeChips.forEach(c => c.addEventListener("click", () => { c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true")); run(); }));
  document.getElementById("search-form").addEventListener("submit", e => { e.preventDefault(); clearTimeout(timer); run(); });
  els.clear.addEventListener("click", () => {
    els.q.value = ""; [els.topic, els.tag, els.by, els.status].forEach(s => s.value = ""); els.sort.value = "best";
    typeChips.forEach(c => c.setAttribute("aria-pressed", "false"));
    run(); els.q.focus();
  });
  els.results.addEventListener("click", e => {
    const t = e.target.closest("[data-tag]");
    if (t) { setSel(els.tag, t.dataset.tag); run(); window.scrollTo({ top: 0 }); return; }
    if (e.target.closest("[data-clear-filters]")) {
      [els.topic, els.tag, els.by, els.status].forEach(s => s.value = "");
      typeChips.forEach(c => c.setAttribute("aria-pressed", "false"));
      run();
    }
  });
  run();
})();
