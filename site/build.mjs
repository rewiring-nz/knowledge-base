// Builds the website into _site/ from entries/*.md and topics/*.md.
// Run with: npm install && npm run build
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_site");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site/config.json"), "utf8"));

const TYPE_NAME = { issue: "Issue", learning: "Learning", explainer: "Explainer" };
const TYPE_WORDS = { issue: ["issue", "problem"], learning: ["learning", "lesson", "insight", "finding"], explainer: ["explainer", "educational", "education", "background"] };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const asList = v => Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean) : typeof v === "string" ? v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : [];
const slugify = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-") || "untitled";

// ---------- read content ----------
function readCollection(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => f.endsWith(".md")).sort().map(file => {
    const text = fs.readFileSync(path.join(full, file), "utf8");
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    let data = {};
    try { data = m ? (yaml.load(m[1]) || {}) : {}; }
    catch (err) { console.warn(`Skipping front matter in ${dir}/${file}: ${err.message}`); }
    return { file: `${dir}/${file}`, slug: file.replace(/\.md$/, ""), data, body: (m ? m[2] : text).trim() };
  });
}

function lastUpdated(file) {
  try { return execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

// Uploaded images are stored as /media/...; make them work under any site path.
const mediaUrl = (u, prefix) => !u ? "" : /^https?:\/\//.test(u) ? u : prefix + String(u).replace(/^\//, "");
const fixMedia = (html, prefix) => html.replace(/(src|href)="\/media\//g, `$1="${prefix}media/`);

const topicFiles = readCollection("topics");
const entryFiles = readCollection("entries");

const topics = new Map();
for (const t of topicFiles) {
  const name = String(t.data.name || t.slug).trim();
  topics.set(name.toLowerCase(), { id: t.slug, name, description: String(t.data.description || ""), items: [] });
}

// Markdown to plain words, for summaries and search.
const plain = md => marked.parse(md || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
// The summary is the first paragraph of the text.
const firstParagraph = md => plain(md.split(/\n\s*\n/).map(s => s.trim()).find(s => s && !/^(#|!\[|<|---|\||```)/.test(s)) || "");

const entries = entryFiles.filter(e => String(e.data.title || "").trim()).map(e => {
  const d = e.data;
  const rawType = String(d.type || "").toLowerCase();
  const type = Object.keys(TYPE_WORDS).find(k => TYPE_WORDS[k].some(w => rawType.includes(w))) || "learning";
  const topicName = String(d.top_tag || d.topic || "").trim() || "Uncategorised";
  if (!topics.has(topicName.toLowerCase())) topics.set(topicName.toLowerCase(), { id: slugify(topicName), name: topicName, description: "", items: [] });
  return {
    id: e.slug,
    file: e.file,
    title: String(d.title).trim(),
    type,
    status: type === "issue" ? (String(d.status || "").toLowerCase() === "resolved" ? "resolved" : "open") : undefined,
    topicName,
    // An older-style `description` setting still works; otherwise the text's first paragraph is the summary.
    lead: String(d.description || "").trim(),
    summary: String(d.description || "").trim() || firstParagraph(e.body),
    tags: asList(d.tags),
    contributors: asList(d.contributors),
    image: d.image ? String(d.image) : "",
    rawRelated: asList(d.related),
    body: e.body,
    updated: lastUpdated(e.file),
  };
});

// Related entries are listed by title (file paths also work). Links go both ways.
const byKey = new Map();
entries.forEach(e => { byKey.set(e.id.toLowerCase(), e.id); byKey.set(e.title.toLowerCase(), e.id); });
const keyOf = s => byKey.get(s.toLowerCase()) || byKey.get(path.basename(s).replace(/\.md$/, "").toLowerCase());
entries.forEach(e => {
  e.rawRelated.filter(s => !keyOf(s)).forEach(s => console.warn(`${e.file}: related entry "${s}" not found. Was it renamed?`));
  e.links = [...new Set(e.rawRelated.map(keyOf).filter(id => id && id !== e.id))];
});
entries.forEach(e => e.links.forEach(id => { const o = entries.find(x => x.id === id); if (o && !o.links.includes(e.id)) o.links.push(e.id); }));
entries.forEach(e => topics.get(e.topicName.toLowerCase()).items.push(e));
const topicList = [...topics.values()].filter(t => t.items.length).sort((a, b) => a.name.localeCompare(b.name));
topicList.forEach(t => t.items.sort((a, b) => a.title.localeCompare(b.title)));
const byId = new Map(entries.map(e => [e.id, e]));

const editorBase = `${config.editor}/${config.repo}/${encodeURIComponent(config.branch)}/collection`;
const editUrl = e => `${editorBase}/entries/edit/${encodeURIComponent(e.file)}`;
const newUrl = `${editorBase}/entries/new`;
const repoUrl = `https://github.com/${config.repo}`;

// ---------- page layout ----------
const FONTS = "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=swap";
const NAV = [["", "Map"], ["all/", "Search entries"], ["contribute/", "How to contribute"]];

function layout({ title, prefix, active, description, body, bodyClass = "reading", head = "" }) {
  const nav = NAV.map(([href, label]) => `<a href="${prefix}${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title === config.title ? title : `${title} · ${config.title}`)}</title>
<meta name="description" content="${esc(description || config.description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${prefix}assets/style.css">
${head}</head>
<body class="${bodyClass}" data-prefix="${prefix}">
<header class="site-header">
  <a class="brand-link" href="${prefix}">${esc(config.title)}</a>
  <nav class="site-nav" aria-label="Main">${nav}</nav>
  ${bodyClass === "home"
    ? `<button type="button" id="who" class="who" hidden></button><button type="button" class="add-btn" data-add="">Add an entry</button>`
    : `<a class="add-btn" href="${prefix}?add">Add an entry</a>`}
</header>
${body}
</body>
</html>
`;
}

const footer = prefix => `<footer class="site-footer">Anyone can read this knowledge base. The content is stored openly on <a href="${repoUrl}">GitHub</a>. <a href="${prefix}contribute/">Want to help?</a> Using an AI assistant? <a href="${prefix}ai-guide/">Read the AI guide</a>.</footer>`;
const keyClass = e => e.type === "issue" ? (e.status === "open" ? "issue-open" : "issue") : e.type;
const subLine = e => TYPE_NAME[e.type] + (e.status ? " · " + e.status[0].toUpperCase() + e.status.slice(1) : "");
const entryRow = (e, prefix, extra = "") => `<li><a href="${prefix}entries/${e.id}/"><span class="k ${keyClass(e)}"></span><span>${esc(e.title)}<small>${esc(subLine(e) + extra)}</small></span></a></li>`;

function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- build ----------
// When this build ran. The map uses it to tell when saved changes have reached the live site.
const BUILT_AT = new Date().toISOString();
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
write("build.json", JSON.stringify({ builtAt: BUILT_AT }));
fs.cpSync(path.join(ROOT, "site/assets"), path.join(OUT, "assets"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "media"))) fs.cpSync(path.join(ROOT, "media"), path.join(OUT, "media"), { recursive: true });

// Search data shared by the map and the search page
const searchData = entries.map(e => ({
  id: e.id, url: `entries/${e.id}/`, title: e.title, type: e.type, status: e.status, topic: e.topicName,
  tags: e.tags, contributors: e.contributors, summary: e.summary, text: plain(e.body), updated: e.updated,
}));
write("assets/search-data.js", `// Generated by site/build.mjs\nwindow.KB_SEARCH = ${JSON.stringify(searchData).replace(/</g, "\\u003c")};\n`);
const searchScripts = prefix => `<script src="${prefix}assets/search-data.js"></script>\n<script src="${prefix}assets/search.js"></script>`;
const options = (list, all) => `<option value="">${all}</option>` + list.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
const allTags = [...new Set(entries.flatMap(e => e.tags))].sort((a, b) => a.localeCompare(b));

// Home: the map
const mapData = {
  title: config.title,
  description: config.description,
  centreLabel: config.centreLabel,
  builtAt: BUILT_AT,
  topics: topicList.map(t => ({
    id: "topic-" + t.id,
    name: t.name,
    items: t.items.map(e => ({
      id: e.id, title: e.title, type: e.type, status: e.status, summary: e.summary, tags: e.tags,
      links: [...e.links], contributors: e.contributors.join(", "),
      url: `entries/${e.id}/`, editUrl: editUrl(e), updated: e.updated,
      image: e.image ? mediaUrl(e.image, "") : "",
      lead: e.lead, html: e.body ? fixMedia(marked.parse(e.body), "") : "",
    })),
  })),
};
write("index.html", layout({
  title: config.title, prefix: "", active: "", bodyClass: "home",
  body: `<div class="app">
  <div class="bar">
    <div class="search">
      <label class="sr" for="q">Search the knowledge base</label>
      <input id="q" type="search" autocomplete="off" placeholder="Search everything, e.g. V2G, export limit, warranty">
    </div>
    <div class="selects">
      <label class="sr" for="m-tag">Tag</label>
      <select id="m-tag">${options(allTags, "All tags")}</select>
    </div>
    <div class="filters" id="m-topics" role="group" aria-label="Top tags">
      <button class="chip" data-topic="" aria-pressed="true">All</button>
      ${topicList.map(t => `<button class="chip" data-topic="${esc(t.name)}" aria-pressed="false">${esc(t.name)}</button>`).join("\n      ")}
    </div>
  </div>
  <main class="main">
    <section class="map" aria-label="Mind map of the knowledge base">
      <svg id="svg"></svg>
      <div class="tools">
        <button id="zin" aria-label="Zoom in">+</button>
        <button id="zout" aria-label="Zoom out">&minus;</button>
        <button id="zfit" class="fit" aria-label="Fit the map to the screen">Fit</button>
      </div>
      <div class="legend" aria-hidden="true">
        <span><i class="k issue-open"></i>Open issue</span>
        <span><i class="k issue"></i>Resolved issue</span>
        <span><i class="k learning"></i>Learning</span>
        <span><i class="k explainer"></i>Explainer</span>
        <span class="legend-pending" hidden><i class="k pending"></i>Suggested</span>
      </div>
    </section>
    <aside class="panel" id="panel" aria-live="polite"></aside>
    <aside class="panel editor" id="editor" aria-label="Add or edit an entry" hidden></aside>
  </main>
</div>
<script>window.KB = ${JSON.stringify(mapData).replace(/</g, "\\u003c")};
window.KB_CONFIG = ${JSON.stringify({ api: config.api || "", turnstileSiteKey: config.turnstileSiteKey || "", newUrl })};</script>
${searchScripts("")}
${config.turnstileSiteKey ? `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async></script>` : ""}
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script src="assets/map.js"></script>
<script src="assets/editor.js"></script>`,
}));

// One page per entry
for (const e of entries) {
  const prefix = "../../";
  const related = e.links.map(id => byId.get(id)).filter(Boolean);
  const bodyHtml = e.body ? fixMedia(marked.parse(e.body), prefix) : "";
  const pills = `<div class="pills"><span class="pill ${e.type}">${TYPE_NAME[e.type]}</span>${e.status ? `<span class="pill ${e.status}">${e.status === "open" ? "Open" : "Resolved"}</span>` : ""}</div>`;
  write(`entries/${e.id}/index.html`, layout({
    title: e.title, prefix, active: null, description: e.summary,
    body: `<main class="page">
  <p class="crumb"><a href="${prefix}">${esc(config.centreLabel)}</a> &rsaquo; ${esc(e.topicName)}</p>
  <h1>${esc(e.title)}</h1>
  ${pills}
  ${e.image ? `<img class="hero-img" src="${esc(mediaUrl(e.image, prefix))}" alt="">` : ""}
  ${e.lead ? `<p class="lead">${esc(e.lead)}</p>` : ""}
  ${bodyHtml ? `<div class="prose">${bodyHtml}</div>` : ""}
  ${e.tags.length ? `<h3>Tags</h3><div class="tags">${e.tags.map(t => `<a class="tag" href="${prefix}all/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>` : ""}
  ${related.length ? `<h3>Related</h3><ul class="list">${related.map(r => entryRow(r, prefix, " · " + r.topicName)).join("")}</ul>` : ""}
  <div class="meta">
    ${e.contributors.length ? `<span>Added by ${esc(e.contributors.join(", "))}</span>` : ""}
    ${e.updated ? `<span>Last updated ${esc(e.updated)}</span>` : ""}
    <a href="${prefix}?edit=${encodeURIComponent(e.id)}">Edit this entry</a>
    <a href="${prefix}?q=${encodeURIComponent(e.title)}">Show on the map</a>
  </div>
</main>
${footer(prefix)}`,
  }));
}

// Search entries: full-text search and filters. The plain grouped list below is shown until the script runs.
write("all/index.html", layout({
  title: "Search entries", prefix: "../", active: "all/",
  body: `<main class="page wide">
  <h1>Search entries</h1>
  <form id="search-form" class="search-form" role="search">
    <label class="sr" for="s-q">Search words</label>
    <input id="s-q" type="search" autocomplete="off" placeholder="Search titles, text, tags and contributors">
    <p class="hint">Partial words and small typos still match. Use "quotes" for an exact phrase and a minus sign to leave words out, e.g. <code>charger -noise</code>.</p>
    <div class="filter-row">
      <span class="filter-label">Only show</span>
      <button type="button" class="chip" data-type="explainer" aria-pressed="false"><span class="k explainer"></span>Explainers</button>
      <button type="button" class="chip" data-type="learning" aria-pressed="false"><span class="k learning"></span>Learnings</button>
      <button type="button" class="chip" data-type="issue" aria-pressed="false"><span class="k issue"></span>Issues</button>
    </div>
    <div class="filter-grid">
      <label>Top tag <select id="s-topic"></select></label>
      <label>Tag <select id="s-tag"></select></label>
      <label>Added by <select id="s-by"></select></label>
      <label>Issue status <select id="s-status"><option value="">Any</option><option value="open">Open</option><option value="resolved">Resolved</option></select></label>
      <label>Order <select id="s-sort"><option value="best">Best match</option><option value="az">A to Z</option><option value="new">Recently updated</option></select></label>
    </div>
  </form>
  <div class="result-bar"><p id="s-count" class="count" aria-live="polite"></p><button type="button" id="s-clear" class="linkish" hidden>Clear search and filters</button></div>
  <div id="results">
  ${topicList.map(t => `<section class="group">
    <h2>${esc(t.name)}</h2>
    ${t.description ? `<p>${esc(t.description)}</p>` : ""}
    <ul class="list">${t.items.map(e => entryRow(e, "../")).join("")}</ul>
  </section>`).join("\n  ")}
  </div>
</main>
${footer("../")}
${searchScripts("../")}
<script src="../assets/browse.js"></script>`,
}));

// How to contribute
write("contribute/index.html", layout({
  title: "How to contribute", prefix: "../", active: "contribute/",
  body: `<main class="page">
  <h1>How to contribute</h1>
  <p class="lead">Anyone can add or improve entries with a short form beside the map. No account or technical knowledge is needed.</p>
  <h2>Add an entry</h2>
  <ol class="steps">
    <li>Click <b>Add an entry</b> at the top of any page. A form opens beside the map.</li>
    <li>Fill in the title, choose the type of entry and top tag, and write the text. Start the text with a one-paragraph summary.</li>
    <li>Click <b>Send suggestion</b>. An editor checks it, and once approved it appears on the map within a couple of minutes.</li>
  </ol>
  <h2>Fix or improve an entry</h2>
  <p>Click the entry on the map, then <b>Edit this entry</b> under it. Make your changes and send them.</p>
  <h2>Add a new top tag</h2>
  <p>Top tags are the branches of the map. In the form, choose <b>+ New top tag…</b> in the Top tag list and type its name. Editors can rename a top tag by clicking it on the map.</p>
  <div class="callout"><p>Every change is saved with its full history, so nothing is lost by mistake and anything can be undone.</p></div>
  <h2>Using an AI assistant</h2>
  <p>Your AI can turn notes and reports into entries in the right structure. Give it the <a href="../ai-guide/">guide for AI assistants</a> along with your notes, and check what it produces before sending.</p>
  <h2>Getting invited as an editor</h2>
  <p>Anyone can suggest entries and changes. Editors can also publish straight away and approve suggestions. Ask an existing editor for a personal sign-in link.</p>
</main>
${footer("../")}`,
}));

// ---------- for AI assistants ----------
const site = config.siteUrl.replace(/\/?$/, "/");
write("ai-guide/index.html", layout({
  title: "Guide for AI assistants", prefix: "../", active: null,
  description: "How AI assistants can add entries to this knowledge base in the right structure.",
  body: `<main class="page prose-page"><div class="prose">${marked.parse(fs.readFileSync(path.join(ROOT, "AI-GUIDE.md"), "utf8"))}</div></main>
${footer("../")}`,
}));
write("api/entries.json", JSON.stringify(entries.map(e => ({
  id: e.id, title: e.title, type: TYPE_NAME[e.type], status: e.status ? e.status[0].toUpperCase() + e.status.slice(1) : undefined,
  top_tag: e.topicName, tags: e.tags, summary: e.summary, related: e.links.map(id => byId.get(id).title),
  url: `${site}entries/${e.id}/`, updated: e.updated || undefined,
})), null, 2));
write("api/topics.json", JSON.stringify(topicList.map(t => ({ name: t.name, description: t.description || undefined, entries: t.items.length })), null, 2));
write("llms.txt", `# ${config.title}

> ${config.description}

AI assistants: read the guide before adding or changing entries. It explains the entry structure and how to send entries.

- [Guide for AI assistants](${site}ai-guide/)
- [All entries as JSON](${site}api/entries.json)
- [Top tags as JSON](${site}api/topics.json)
- [Save service description (OpenAPI)](${site}openapi.yaml)
`);
const apiUrl = config.api ? config.api.replace(/\/$/, "") : "https://save-service-not-set-up-yet.example";
write("openapi.yaml", `openapi: 3.1.0
info:
  title: ${config.title} save service
  version: "1"
  description: >-
    Adds or changes knowledge base entries. Read ${site}ai-guide/ first.
    Without an Authorization header, entries are sent as suggestions for an editor to approve.${config.api ? "" : " NOTE: the save service is not set up yet, so this address does not work."}
servers:
  - url: ${apiUrl}
paths:
  /api/entries:
    post:
      operationId: saveEntry
      summary: Add a new entry, or change one (include id and sha)
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [entry]
              properties:
                name: { type: string, description: Name of the person sending it }
                id: { type: string, description: Only when changing an existing entry. From entries.json }
                sha: { type: string, description: Only when changing an entry. From GET /api/entry }
                entry:
                  type: object
                  required: [title, type, top_tag]
                  properties:
                    title: { type: string, maxLength: 150 }
                    type: { type: string, enum: [Explainer, Learning, Issue] }
                    status: { type: string, enum: [Open, Resolved], description: Issues only }
                    top_tag: { type: string, description: An existing top tag from api/topics.json where one fits }
                    body: { type: string, description: Markdown. The first paragraph is the summary }
                    tags: { type: array, items: { type: string } }
                    related: { type: array, items: { type: string }, description: Exact titles of existing entries }
                    contributors: { type: array, items: { type: string } }
      responses:
        "200":
          description: Saved
          content:
            application/json:
              schema:
                type: object
                properties:
                  mode: { type: string, enum: [suggested, published] }
        "400":
          description: Something needs fixing; the error says what
  /api/entry:
    get:
      operationId: getEntry
      summary: The current version of one entry, for changing it
      parameters:
        - { name: id, in: query, required: true, schema: { type: string } }
      responses:
        "200": { description: The entry's fields, text and sha }
`);

write("404.html", layout({
  title: "Page not found", prefix: "/" + config.repo.split("/")[1] + "/", active: null,
  body: `<main class="page"><h1>Page not found</h1><p class="lead">That page doesn't exist. It may have been renamed. <a href="/${config.repo.split("/")[1]}/">Go to the map</a>.</p></main>`,
}));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log(`Built ${entries.length} entries under ${topicList.length} top tags into _site/`);
