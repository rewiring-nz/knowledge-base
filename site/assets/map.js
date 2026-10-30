// The map's data is written into the page by site/build.mjs as window.KB;
// window.KB_SEARCH (assets/search-data.js) holds the full text used by search.
const KB = window.KB;
const SEARCH = window.KB_SEARCH || [];

let TOPICS = [], ITEMS = new Map(), TOPIC_BY_ID = new Map();
function ingest(topics) {
  TOPICS = topics;
  ITEMS = new Map();
  TOPICS.forEach(t => t.items.forEach(it => { it.topic = t; ITEMS.set(it.id, it); }));
  ITEMS.forEach(it => it.links.forEach(id => { const o = ITEMS.get(id); if (o && !o.links.includes(it.id)) o.links.push(it.id); }));
  TOPIC_BY_ID = new Map(TOPICS.map(t => [t.id, t]));
  if (state.selected && !ITEMS.has(state.selected) && !TOPIC_BY_ID.has(state.selected)) state.selected = null;
}

const TYPE_NAME = { issue: "Issue", learning: "Learning", explainer: "Explainer" };
const state = { q: "", topic: "", tag: "", selected: null, collapsed: new Set(), filters: { issue: true, learning: true, explainer: true, open: true, resolved: true } };
const DUR = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350;
const ROW = 30, TOPIC_GAP = 150, LEAF_GAP = 42, LABEL_MAX = 46;
const ROOT_LABEL = KB.centreLabel;
const ROOT_FONT = '700 18px "Bricolage Grotesque", system-ui, sans-serif';
const TOPIC_FONT = '700 14px "Bricolage Grotesque", system-ui, sans-serif';
const ITEM_FONT = '400 13px "Atkinson Hyperlegible", system-ui, sans-serif';

const ctx = document.createElement("canvas").getContext("2d");
const textW = (s, font) => { ctx.font = font; return ctx.measureText(s).width; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = s => s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1).trimEnd() + "…" : s;
const passes = it => state.filters[it.type] && (it.type !== "issue" || state.filters[it.status]) &&
  (!state.topic || it.topic.name === state.topic) && (!state.tag || it.tags.includes(state.tag));
const keyClass = it => it.type === "issue" ? (it.status === "open" ? "issue-open" : "issue") : it.type;

// Full-text search (assets/search.js) over the items the filters let through, best matches first.
let lastResults = [];
function matchSet() {
  lastResults = [];
  if (!state.q.trim()) return null;
  const pool = SEARCH.filter(e => { const it = ITEMS.get(e.id); return it && passes(it); });
  const { results, parsed } = KBSearch.search(pool, state.q);
  if (parsed.empty) return null;
  lastResults = results;
  return new Set(results.map(r => r.entry.id));
}
const filtering = () => !!(state.topic || state.tag);

const hPath = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2; return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`; };

function computeLayout() {
  const matches = matchSet();
  const nodes = [], edges = [], pos = new Map();
  const rootW = textW(ROOT_LABEL, ROOT_FONT) + 40;
  const bounds = { x0: -rootW / 2, x1: rootW / 2, y0: -24, y1: 24 };
  const grow = (x, y) => { bounds.x0 = Math.min(bounds.x0, x); bounds.x1 = Math.max(bounds.x1, x); bounds.y0 = Math.min(bounds.y0, y - 18); bounds.y1 = Math.max(bounds.y1, y + 18); };
  nodes.push({ id: "root", kind: "root", x: 0, y: 0, sx: 0, sy: 0, w: rootW, label: ROOT_LABEL });

  // A top tag or tag filter hides branches with nothing left in them
  const shown = filtering() ? TOPICS.filter(t => t.items.some(passes)) : TOPICS;
  const half = Math.ceil(shown.length / 2);
  [[shown.slice(0, half), 1], [shown.slice(half), -1]].forEach(([topics, sign]) => {
    const data = { children: topics.map(t => {
      const items = t.items.filter(passes);
      const forced = matches && items.some(i => matches.has(i.id));
      const open = forced || !state.collapsed.has(t.id);
      return { topic: t, items, open, children: open && items.length ? items.map(it => ({ item: it })) : undefined };
    }) };
    const h = d3.hierarchy(data);
    d3.tree().nodeSize([ROW, 1]).separation((a, b) => a.parent === b.parent ? (a.depth === 1 ? 1.35 : 1) : 1.6)(h);
    (h.children || []).forEach(tn => {
      const { topic: t, items, open } = tn.data;
      const y = tn.x;
      const w = 14 + textW(t.name, TOPIC_FONT) + 10 + 28 + 6;
      const xInner = sign * TOPIC_GAP;
      const xLeft = sign > 0 ? xInner : xInner - w;
      const xOuter = sign > 0 ? xInner + w : xInner - w;
      const dim = matches ? !items.some(i => matches.has(i.id)) : false;
      nodes.push({ id: t.id, kind: "topic", x: xLeft, y, sx: xLeft, sy: y, w, sign, label: t.name, count: items.length, open, dim, topic: t });
      edges.push({ id: "e-" + t.id, d: hPath(sign * rootW / 2, 0, xInner, y), dim });
      grow(xLeft, y); grow(xLeft + w, y);
      (tn.children || []).forEach(ln => {
        const it = ln.data.item;
        const x = xOuter + sign * LEAF_GAP, ly = ln.x;
        const label = short(it.title);
        const n = { id: it.id, kind: "item", x, y: ly, sx: xOuter, sy: y, sign, label, item: it, dim: matches ? !matches.has(it.id) : false, match: matches ? matches.has(it.id) : false };
        nodes.push(n); pos.set(it.id, n);
        edges.push({ id: "e-" + it.id, d: hPath(xOuter, y, x - sign * 7, ly), start: hPath(xOuter, y, xOuter, y), dim: n.dim });
        grow(x, ly); grow(x + sign * (14 + textW(label, ITEM_FONT)), ly);
      });
    });
  });
  return { nodes, edges, pos, bounds, matches };
}

// ---------- SVG scaffold ----------
const svg = d3.select("#svg");
const gRoot = svg.append("g");
const gEdges = gRoot.append("g");
const gCross = gRoot.append("g");
const gNodes = gRoot.append("g");
const zoom = d3.zoom().scaleExtent([0.25, 2.5]).on("zoom", e => gRoot.attr("transform", e.transform));
svg.call(zoom).on("dblclick.zoom", null);
let layout = null;

function build(g, d) {
  if (d.kind === "root") {
    g.append("rect").attr("class", "root-pill");
    g.append("text").attr("class", "root-lbl").attr("text-anchor", "middle").attr("dy", "0.35em");
  } else if (d.kind === "topic") {
    g.append("title");
    g.append("rect").attr("class", "topic-pill");
    g.append("text").attr("class", "topic-lbl").attr("dy", "0.35em");
    g.append("rect").attr("class", "badge");
    g.append("text").attr("class", "badge-lbl").attr("text-anchor", "middle").attr("dy", "0.35em");
  } else {
    g.append("title");
    g.append("circle").attr("class", "halo").attr("r", 11);
    g.append("circle").attr("class", "dot").attr("r", 6);
    g.append("path").attr("class", "check").attr("d", "M-3,0.2L-1,2.3L3,-2.2");
    g.append("text").attr("class", "item-lbl").attr("dy", "0.35em");
  }
}

function refresh(g, d) {
  if (d.kind === "root") {
    g.select("rect").attr("x", -d.w / 2).attr("y", -22).attr("width", d.w).attr("height", 44).attr("rx", 22);
    g.select("text").text(d.label);
  } else if (d.kind === "topic") {
    g.select("title").text(`${d.label}: ${d.count} items. Click to ${d.open ? "close" : "open"}.`);
    g.select(".topic-pill").attr("x", 0).attr("y", -14).attr("width", d.w).attr("height", 28).attr("rx", 14);
    g.select(".topic-lbl").attr("x", 14).text(d.label);
    g.select(".badge").attr("x", d.w - 34).attr("y", -10).attr("width", 28).attr("height", 20).attr("rx", 10);
    g.select(".badge-lbl").attr("x", d.w - 20).text(d.open ? d.count : "+" + d.count);
  } else {
    const it = d.item;
    g.select("title").text(it.title);
    g.select(".check").attr("display", it.type === "issue" && it.status === "resolved" ? null : "none");
    g.select(".item-lbl").attr("x", d.sign * 13).attr("text-anchor", d.sign > 0 ? "start" : "end").text(d.label);
  }
}

function classes(d) {
  const sel = state.selected;
  if (d.kind === "root") return "node root";
  if (d.kind === "topic") return "node topic" + (sel === d.id ? " selected" : "");
  const it = d.item, s = sel && ITEMS.get(sel);
  return "node item t-" + it.type + (it.status ? " s-" + it.status : "") + (d.match ? " match" : "") +
    (sel === it.id ? " selected" : "") + (s && s.links.includes(it.id) ? " related" : "");
}

function ariaLabel(d) {
  if (d.kind === "root") return ROOT_LABEL + ". Open or close all topics.";
  if (d.kind === "topic") return `${d.label}, ${d.count} items, ${d.open ? "open" : "closed"}`;
  const it = d.item;
  return `${TYPE_NAME[it.type]}${it.status ? ", " + it.status : ""}: ${it.title}`;
}

function render() {
  layout = computeLayout();
  const t = svg.transition().duration(DUR);

  gEdges.selectAll("path.edge").data(layout.edges, d => d.id).join(
    enter => enter.append("path").attr("class", "edge").attr("d", d => d.start || d.d).attr("opacity", 0),
    update => update,
    exit => exit.transition(t).attr("opacity", 0).remove()
  ).transition(t).attr("d", d => d.d).attr("opacity", d => d.dim ? 0.3 : 1);

  const sel = gNodes.selectAll("g.node").data(layout.nodes, d => d.id).join(
    enter => {
      const g = enter.append("g").attr("tabindex", 0).attr("role", "button")
        .attr("transform", d => `translate(${d.sx},${d.sy})`).attr("opacity", 0)
        .on("click", (e, d) => onNode(d))
        .on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNode(d); } });
      g.each(function (d) { build(d3.select(this), d); });
      return g;
    },
    update => update,
    exit => exit.transition(t).attr("opacity", 0).remove()
  );
  sel.each(function (d) { refresh(d3.select(this), d); });
  sel.attr("class", classes).attr("aria-label", ariaLabel);
  sel.transition(t).attr("transform", d => `translate(${d.x},${d.y})`).attr("opacity", d => d.dim ? 0.25 : 1);

  const cross = [];
  const s = state.selected && ITEMS.get(state.selected);
  if (s) {
    const a = layout.pos.get(s.id);
    if (a) s.links.forEach(id => { const b = layout.pos.get(id); if (b) cross.push({ id: s.id + ">" + id, a, b }); });
  }
  gCross.selectAll("path.cross").data(cross, d => d.id).join(
    enter => enter.append("path").attr("class", "cross").attr("opacity", 0),
    update => update,
    exit => exit.remove()
  ).attr("d", d => `M${d.a.x},${d.a.y}C${d.a.x - d.a.sign * 110},${d.a.y} ${d.b.x - d.b.sign * 110},${d.b.y} ${d.b.x},${d.b.y}`)
    .transition().delay(DUR).duration(DUR ? 200 : 0).attr("opacity", 1);

  renderPanel();
}

function fit(animate = true) {
  const b = layout.bounds;
  const { width: W, height: H } = svg.node().getBoundingClientRect();
  if (!W || !H) return;
  const k = Math.min(1.3, 0.9 * Math.min(W / (b.x1 - b.x0), H / (b.y1 - b.y0)));
  const tr = d3.zoomIdentity.translate(W / 2 - k * (b.x0 + b.x1) / 2, H / 2 - k * (b.y0 + b.y1) / 2).scale(k);
  (animate && DUR ? svg.transition().duration(DUR) : svg).call(zoom.transform, tr);
}

function panTo(id) {
  const n = layout.pos.get(id);
  if (!n) return;
  const k = d3.zoomTransform(svg.node()).k;
  const cx = n.x + n.sign * Math.min(160, 80 / k);
  (DUR ? svg.transition().duration(DUR) : svg).call(zoom.translateTo, cx, n.y);
}

// ---------- interaction ----------
function onNode(d) {
  if (d.kind === "root") {
    const anyOpen = TOPICS.some(t => !state.collapsed.has(t.id));
    TOPICS.forEach(t => anyOpen ? state.collapsed.add(t.id) : state.collapsed.delete(t.id));
    state.selected = null;
    render();
    setTimeout(() => fit(), DUR);
  } else if (d.kind === "topic") {
    if (state.collapsed.has(d.id)) state.collapsed.delete(d.id); else state.collapsed.add(d.id);
    state.selected = d.id;
    render();
  } else {
    selectItem(d.item.id);
  }
}

function selectItem(id) {
  const it = ITEMS.get(id);
  if (!it) return;
  state.selected = id;
  state.collapsed.delete(it.topic.id);
  if (!passes(it)) { state.filters[it.type] = true; if (it.status) state.filters[it.status] = true; syncChips(); }
  if (!passes(it)) { state.topic = state.tag = ""; selects.topic.value = selects.tag.value = ""; }
  render();
  panTo(id);
  if (matchMedia("(max-width: 760px)").matches) document.getElementById("panel").scrollIntoView({ behavior: DUR ? "smooth" : "auto", block: "start" });
}

function itemRow(it, sub) {
  return `<li><button data-select="${it.id}"><span class="k ${keyClass(it)}"></span><span>${esc(it.title)}<small>${esc(sub)}</small></span></button></li>`;
}
function resultRow(r) {
  const it = ITEMS.get(r.entry.id);
  return `<li><button data-select="${it.id}"><span class="k ${keyClass(it)}"></span><span>${KBSearch.highlight(it.title, r.found)}<small>${esc(subLine(it) + " · " + it.topic.name)}</small><span class="mini-snippet">${KBSearch.snippet(r.entry, r.found, 140)}</span></span></button></li>`;
}
const subLine = it => TYPE_NAME[it.type] + (it.status ? " · " + it.status[0].toUpperCase() + it.status.slice(1) : "");

function renderPanel() {
  const p = document.getElementById("panel");
  const sel = state.selected;
  const it = sel && ITEMS.get(sel);
  const topic = sel && TOPIC_BY_ID.get(sel);
  const matches = layout.matches;
  const backLink = matches ? `<button class="linkish" data-back>&larr; Back to ${matches.size} search result${matches.size === 1 ? "" : "s"}</button>` : "";
  // An open entry gets a wider reading panel, scrolled to the top
  document.querySelector(".main").classList.toggle("reading", !!it);
  if (it && p.dataset.showing !== it.id) p.scrollTop = 0;
  p.dataset.showing = it ? it.id : "";

  if (it) {
    const related = it.links.map(id => ITEMS.get(id)).filter(Boolean);
    p.innerHTML = `${backLink}
      <p class="crumb">${esc(ROOT_LABEL)} &rsaquo; ${esc(it.topic.name)}</p>
      <h2>${esc(it.title)}</h2>
      <div class="pills"><span class="pill ${it.type}">${TYPE_NAME[it.type]}</span>${it.status ? `<span class="pill ${it.status}">${it.status === "open" ? "Open" : "Resolved"}</span>` : ""}</div>
      ${it.image ? `<img class="photo" src="${esc(it.image)}" alt="">` : ""}
      ${it.lead ? `<p class="lead">${esc(it.lead)}</p>` : ""}
      ${it.html ? `<div class="prose">${it.html}</div>` : (!it.lead && it.summary ? `<p>${esc(it.summary)}</p>` : "")}
      ${it.tags.length ? `<h3>Tags</h3>
      <div class="tags">${it.tags.map(t => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
      ${related.length ? `<h3>Related</h3><ul class="list">${related.map(r => itemRow(r, subLine(r) + " · " + r.topic.name)).join("")}</ul>` : ""}
      <div class="meta">
        ${it.contributors ? `<span>Added by ${esc(it.contributors)}</span>` : ""}
        ${it.updated ? `<span>Updated ${esc(it.updated)}</span>` : ""}
        <a href="${esc(it.url)}">Open as its own page</a>
        <a href="${esc(it.editUrl)}" target="_blank" rel="noopener">Edit this entry</a>
      </div>`;
  } else if (topic) {
    const items = topic.items.filter(passes);
    p.innerHTML = `${backLink}
      <p class="crumb">${esc(ROOT_LABEL)}</p>
      <h2>${esc(topic.name)}</h2>
      <p>${items.length} item${items.length === 1 ? "" : "s"} shown. Click the topic on the map again to ${state.collapsed.has(topic.id) ? "open" : "close"} it.</p>
      <ul class="list">${items.map(i => itemRow(i, subLine(i))).join("")}</ul>`;
  } else if (matches) {
    const n = lastResults.length;
    p.innerHTML = `<p class="crumb">Search</p>
      <h2>${n} result${n === 1 ? "" : "s"} for “${esc(state.q.trim())}”</h2>
      ${n ? `<ul class="list">${lastResults.map(resultRow).join("")}</ul>
        <p class="note"><a href="all/?q=${encodeURIComponent(state.q.trim())}">Open these results on the search page</a></p>`
        : `<p>Nothing matches. Try fewer or shorter words, or check the filters above.</p>`}`;
  } else {
    const all = [...ITEMS.values()];
    const n = f => all.filter(f).length;
    p.innerHTML = `<p class="crumb">Overview</p>
      <h2>${esc(KB.title)}</h2>
      <p>${esc(KB.description)}</p>
      <div class="stats">
        <div class="stat"><b>${n(i => i.status === "open")}</b><span>Open issues</span></div>
        <div class="stat"><b>${n(i => i.status === "resolved")}</b><span>Resolved issues</span></div>
        <div class="stat"><b>${n(i => i.type === "learning")}</b><span>Learnings</span></div>
        <div class="stat"><b>${n(i => i.type === "explainer")}</b><span>Explainers</span></div>
      </div>
      <h3>How to use it</h3>
      <ul class="howto">
        <li>Click an item to see its details and the items linked to it.</li>
        <li>Click a topic to open or close it. Click the centre to open or close everything.</li>
        <li>Search covers every word of every entry. Matches light up on the map and are listed here.</li>
        <li>Use the top tag and tag lists to show just part of the map.</li>
        <li>Drag to move around, scroll or pinch to zoom.</li>
      </ul>`;
  }
}

document.getElementById("panel").addEventListener("click", e => {
  const s = e.target.closest("[data-select]");
  if (s) return selectItem(s.dataset.select);
  const tag = e.target.closest("[data-tag]");
  if (tag) { setFilter("tag", tag.dataset.tag); return; }
  if (e.target.closest("[data-back]")) { state.selected = null; render(); }
});

const q = document.getElementById("q");
function setQuery(v) { q.value = v; state.q = v; state.selected = null; render(); }
let typing;
q.addEventListener("input", () => { clearTimeout(typing); typing = setTimeout(() => { state.q = q.value; state.selected = null; render(); }, 120); });
q.addEventListener("keydown", e => {
  if (e.key === "Enter") { clearTimeout(typing); state.q = q.value; render(); if (lastResults.length) selectItem(lastResults[0].entry.id); }
  if (e.key === "Escape") setQuery("");
});

// Top tag and tag lists
const selects = { topic: document.getElementById("m-topic"), tag: document.getElementById("m-tag") };
function setFilter(kind, value) {
  const sel = selects[kind];
  if (value && ![...sel.options].some(o => o.value === value)) sel.add(new Option(value, value));
  sel.value = value || "";
  state[kind] = sel.value;
  const it = state.selected && ITEMS.get(state.selected);
  if (it && !passes(it)) state.selected = null;
  render();
  setTimeout(() => fit(), DUR);
}
Object.entries(selects).forEach(([kind, sel]) => sel.addEventListener("change", () => setFilter(kind, sel.value)));

function syncChips() {
  document.querySelectorAll(".chip[data-f]").forEach(b => b.setAttribute("aria-pressed", String(state.filters[b.dataset.f])));
}
document.querySelectorAll(".chip[data-f]").forEach(b => b.addEventListener("click", () => {
  const f = b.dataset.f;
  state.filters[f] = !state.filters[f];
  syncChips();
  const it = state.selected && ITEMS.get(state.selected);
  if (it && !passes(it)) state.selected = null;
  render();
}));

document.getElementById("zin").addEventListener("click", () => svg.transition().duration(DUR).call(zoom.scaleBy, 1.3));
document.getElementById("zout").addEventListener("click", () => svg.transition().duration(DUR).call(zoom.scaleBy, 1 / 1.3));
document.getElementById("zfit").addEventListener("click", () => fit());
svg.on("click", e => { if (e.target === svg.node() && state.selected) { state.selected = null; render(); } });

// Refit whenever the map box changes size, until the viewer pans or zooms it themselves
let userMoved = false;
zoom.on("start.user", e => { if (e.sourceEvent) userMoved = true; });
new ResizeObserver(() => {
  if (!layout) return;
  if (state.selected && layout.pos.has(state.selected)) panTo(state.selected);
  else if (!userMoved) fit(false);
}).observe(document.querySelector(".map"));

ingest(KB.topics);
const start = new URLSearchParams(location.search);
if (start.get("q")) { q.value = start.get("q"); state.q = q.value; }
for (const kind of ["topic", "tag"]) {
  const v = start.get(kind);
  if (v) { if (![...selects[kind].options].some(o => o.value === v)) selects[kind].add(new Option(v, v)); selects[kind].value = v; state[kind] = v; }
}
render();
fit(false);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { render(); if (!userMoved) fit(false); });
