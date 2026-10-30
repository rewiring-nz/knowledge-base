// Shared search for the map and the "Search entries" page.
// Matches whole words, the start of words ("charg" finds "charger") and small typos ("chager").
// Query syntax: "exact phrase", -excluded. All other words must all match somewhere.
(function () {
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const tokenize = s => norm(s).match(/[a-z0-9]+/g) || [];
  // Indexed words also include hyphenated words joined up, so "wifi" finds "Wi-Fi".
  const indexTokens = s => [...tokenize(s), ...(norm(s).match(/[a-z0-9]+(?:[-'’/][a-z0-9]+)+/g) || []).map(w => w.replace(/[-'’/]/g, ""))];
  const escHtml = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Where a match counts most: a word in the title outweighs one deep in the text.
  const FIELDS = [["title", 10], ["tags", 6], ["topic", 4], ["contributors", 3], ["summary", 3], ["text", 1]];

  function prepare(entries) {
    entries.forEach(e => {
      if (e._f) return;
      e._f = {};
      for (const [f] of FIELDS) {
        const raw = Array.isArray(e[f]) ? e[f].join(" · ") : String(e[f] || "");
        e._f[f] = { norm: norm(raw), tokens: [...new Set(indexTokens(raw))] };
      }
    });
    return entries;
  }

  function parse(q) {
    const terms = [], phrases = [], exclude = [];
    String(q || "").replace(/(-?)"([^"]*)"?|(-?)(\S+)/g, (m, n1, ph, n2, w) => {
      if (ph !== undefined) { const p = norm(ph).trim(); if (p) (n1 ? exclude : phrases).push(p); }
      else if (w) tokenize(w).forEach(t => (n2 ? exclude : terms).push(t));
      return "";
    });
    return { terms: [...new Set(terms)], phrases, exclude, empty: !terms.length && !phrases.length };
  }

  // Edit distance, giving up early once it's over the limit.
  function within(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return false;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return false;
      prev = cur;
    }
    return prev[b.length] <= max;
  }

  // How well one query word matches one field: 1 exact, 0.8 start of a word, 0.5 near-miss.
  function matchTerm(term, field, found) {
    let q = 0;
    const typos = term.length >= 8 ? 2 : term.length >= 4 ? 1 : 0;
    for (const t of field.tokens) {
      let s = 0;
      if (t === term) s = 1;
      else if (t.startsWith(term)) s = 0.8;
      else if (typos && within(term, t, typos)) s = 0.5;
      if (s) { found.add(t); if (s > q) q = s; }
    }
    return q;
  }

  // filters: { types: Set, statuses: Set, topic, tag, contributor }
  function passesFilters(e, f) {
    if (!f) return true;
    if (f.types && !f.types.has(e.type)) return false;
    if (f.statuses && e.type === "issue" && !f.statuses.has(e.status)) return false;
    if (f.topic && e.topic !== f.topic) return false;
    if (f.tag && !(e.tags || []).includes(f.tag)) return false;
    if (f.contributor && !(e.contributors || []).includes(f.contributor)) return false;
    return true;
  }

  function search(entries, query, filters) {
    prepare(entries);
    const p = parse(query);
    const results = [];
    for (const e of entries) {
      if (!passesFilters(e, filters)) continue;
      const all = FIELDS.map(([f]) => e._f[f].norm).join("\n");
      if (p.exclude.some(x => x.includes(" ") ? all.includes(x) : FIELDS.some(([f]) => e._f[f].tokens.some(t => t.startsWith(x))))) continue;
      if (p.empty) { results.push({ entry: e, score: 0, found: new Set() }); continue; }
      let score = 0, ok = true;
      const found = new Set();
      for (const term of p.terms) {
        let best = 0;
        for (const [f, w] of FIELDS) { const m = matchTerm(term, e._f[f], found); if (m) best = Math.max(best, m * w) + 0.1; }
        if (!best) { ok = false; break; }
        score += best;
      }
      if (!ok) continue;
      for (const ph of p.phrases) {
        let best = 0;
        for (const [f, w] of FIELDS) if (e._f[f].norm.includes(ph)) best = Math.max(best, w * 1.5);
        if (!best) { ok = false; break; }
        score += best;
        ph.split(/\s+/).forEach(t => found.add(t));
      }
      if (!ok) continue;
      results.push({ entry: e, score, found });
    }
    if (!p.empty) results.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title));
    return { results, parsed: p };
  }

  // Wraps matched words in <mark>. `found` holds the matched words (normalised).
  function highlight(text, found) {
    const safe = escHtml(text);
    if (!found || !found.size) return safe;
    const re = new RegExp(`\\b(${[...found].sort((a, b) => b.length - a.length).map(escRe).join("|")})`, "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  // A short extract of the text around the first match, or the summary when nothing matched in the text.
  function snippet(e, found, size = 200) {
    // The text usually starts with the summary; only add the summary when it isn't already there.
    const body = String(e.text || ""), sum = String(e.summary || "");
    const text = !body ? sum : body.startsWith(sum) ? body : sum + " " + body;
    if (!found || !found.size) return highlight(text.length > size ? text.slice(0, size).replace(/\s+\S*$/, "") + "…" : text, found);
    const lower = norm(text);
    let at = -1;
    for (const w of found) { const i = lower.search(new RegExp("\\b" + escRe(w))); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return highlight(text.length > size ? text.slice(0, size).replace(/\s+\S*$/, "") + "…" : text, found);
    let start = Math.max(0, at - 60);
    if (start > 0) start = text.indexOf(" ", start) + 1;
    let end = Math.min(text.length, start + size);
    if (end < text.length) end = text.lastIndexOf(" ", end);
    return (start > 0 ? "…" : "") + highlight(text.slice(start, end), found) + (end < text.length ? "…" : "");
  }

  // Values for the filter dropdowns, most used first.
  function facets(entries) {
    const count = (list) => { const m = new Map(); list.forEach(v => v && m.set(v, (m.get(v) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
    return {
      topics: count(entries.map(e => e.topic)),
      tags: count(entries.flatMap(e => e.tags || [])),
      contributors: count(entries.flatMap(e => e.contributors || [])),
    };
  }

  window.KBSearch = { search, highlight, snippet, facets, parse, escHtml };
})();
