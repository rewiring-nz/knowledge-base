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

const entries = entryFiles.filter(e => String(e.data.title || "").trim()).map(e => {
  const d = e.data;
  const rawType = String(d.type || "").toLowerCase();
  const type = Object.keys(TYPE_WORDS).find(k => TYPE_WORDS[k].some(w => rawType.includes(w))) || "learning";
  const topicName = String(d.top_tag || "").trim() || "Uncategorised";
  if (!topics.has(topicName.toLowerCase())) topics.set(topicName.toLowerCase(), { id: slugify(topicName), name: topicName, description: "", items: [] });
  return {
    id: e.slug,
    file: e.file,
    title: String(d.title).trim(),
    type,
    status: type === "issue" ? (String(d.status || "").toLowerCase() === "resolved" ? "resolved" : "open") : undefined,
    topicName,
    summary: String(d.description || "").trim(),
    tags: asList(d.tags),
    contributors: asList(d.contributors),
    image: d.image ? String(d.image) : "",
    rawRelated: asList(d.related),
    body: e.body,
    updated: lastUpdated(e.file),
  };
});

// Related entries are stored as paths ("entries/x.md"); titles also work. Links go both ways.
const byKey = new Map();
entries.forEach(e => { byKey.set(e.id.toLowerCase(), e.id); byKey.set(e.title.toLowerCase(), e.id); });
const keyOf = s => byKey.get(path.basename(s).replace(/\.md$/, "").toLowerCase()) || byKey.get(s.toLowerCase());
entries.forEach(e => { e.links = [...new Set(e.rawRelated.map(keyOf).filter(id => id && id !== e.id))]; });
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
const FONTS = "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&display=swap";
const NAV = [["", "Map"], ["all/", "All entries"], ["contribute/", "How to contribute"]];

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
<body class="${bodyClass}">
<header class="site-header">
  <a class="brand-link" href="${prefix}">${esc(config.title)}</a>
  <nav class="site-nav" aria-label="Main">${nav}</nav>
  <a class="add-btn" href="${newUrl}" target="_blank" rel="noopener">Add an entry</a>
</header>
${body}
</body>
</html>
`;
}

const footer = prefix => `<footer class="site-footer">Anyone can read this knowledge base. The content is stored openly on <a href="${repoUrl}">GitHub</a>. <a href="${prefix}contribute/">Want to help?</a></footer>`;
const keyClass = e => e.type === "issue" ? (e.status === "open" ? "issue-open" : "issue") : e.type;
const subLine = e => TYPE_NAME[e.type] + (e.status ? " · " + e.status[0].toUpperCase() + e.status.slice(1) : "");
const entryRow = (e, prefix, extra = "") => `<li><a href="${prefix}entries/${e.id}/"><span class="k ${keyClass(e)}"></span><span>${esc(e.title)}<small>${esc(subLine(e) + extra)}</small></span></a></li>`;

function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, "site/assets"), path.join(OUT, "assets"), { recursive: true });
if (fs.existsSync(path.join(ROOT, "media"))) fs.cpSync(path.join(ROOT, "media"), path.join(OUT, "media"), { recursive: true });

// Home: the map
const mapData = {
  title: config.title,
  description: config.description,
  centreLabel: config.centreLabel,
  topics: topicList.map(t => ({
    id: "topic-" + t.id,
    name: t.name,
    items: t.items.map(e => ({
      id: e.id, title: e.title, type: e.type, status: e.status, summary: e.summary, tags: e.tags,
      links: [...e.links], contributors: e.contributors.join(", "),
      url: `entries/${e.id}/`, editUrl: editUrl(e),
    })),
  })),
};
write("index.html", layout({
  title: config.title, prefix: "", active: "", bodyClass: "home",
  body: `<div class="app">
  <div class="bar">
    <div class="search">
      <label class="sr" for="q">Search the knowledge base</label>
      <input id="q" type="search" autocomplete="off" placeholder="Search, e.g. V2G, export limit, warranty">
    </div>
    <div class="filters" role="group" aria-label="Show or hide">
      <button class="chip" id="f-issue" data-f="issue" aria-pressed="true"><span class="k issue"></span>Issues</button>
      <button class="chip" id="f-learning" data-f="learning" aria-pressed="true"><span class="k learning"></span>Learnings</button>
      <button class="chip" id="f-explainer" data-f="explainer" aria-pressed="true"><span class="k explainer"></span>Explainers</button>
      <span class="sep" aria-hidden="true"></span>
      <button class="chip" id="f-open" data-f="open" aria-pressed="true">Open</button>
      <button class="chip" id="f-resolved" data-f="resolved" aria-pressed="true">Resolved</button>
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
      </div>
    </section>
    <aside class="panel" id="panel" aria-live="polite"></aside>
  </main>
</div>
<script>window.KB = ${JSON.stringify(mapData).replace(/</g, "\\u003c")};</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script src="assets/map.js"></script>`,
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
  ${e.summary ? `<p class="lead">${esc(e.summary)}</p>` : ""}
  ${bodyHtml ? `<div class="prose">${bodyHtml}</div>` : ""}
  ${e.tags.length ? `<h3>Tags</h3><div class="tags">${e.tags.map(t => `<a class="tag" href="${prefix}?q=${encodeURIComponent(t)}">${esc(t)}</a>`).join("")}</div>` : ""}
  ${related.length ? `<h3>Related</h3><ul class="list">${related.map(r => entryRow(r, prefix, " · " + r.topicName)).join("")}</ul>` : ""}
  <div class="meta">
    ${e.contributors.length ? `<span>Added by ${esc(e.contributors.join(", "))}</span>` : ""}
    ${e.updated ? `<span>Last updated ${esc(e.updated)}</span>` : ""}
    <a href="${editUrl(e)}" target="_blank" rel="noopener">Edit this entry</a>
    <a href="${prefix}?q=${encodeURIComponent(e.title)}">Show on the map</a>
  </div>
</main>
${footer(prefix)}`,
  }));
}

// All entries, grouped by top tag
write("all/index.html", layout({
  title: "All entries", prefix: "../", active: "all/",
  body: `<main class="page">
  <h1>All entries</h1>
  <p class="lead">${entries.length} entr${entries.length === 1 ? "y" : "ies"} under ${topicList.length} top tag${topicList.length === 1 ? "" : "s"}.</p>
  ${topicList.map(t => `<section class="group">
    <h2>${esc(t.name)}</h2>
    ${t.description ? `<p>${esc(t.description)}</p>` : ""}
    <ul class="list">${t.items.map(e => entryRow(e, "../")).join("")}</ul>
  </section>`).join("\n  ")}
</main>
${footer("../")}`,
}));

// How to contribute
write("contribute/index.html", layout({
  title: "How to contribute", prefix: "../", active: "contribute/",
  body: `<main class="page">
  <h1>How to contribute</h1>
  <p class="lead">Anyone invited as an editor can add or change entries through a simple online form. No technical knowledge is needed.</p>
  <h2>Add an entry</h2>
  <ol class="steps">
    <li>Click <b>Add an entry</b> at the top of any page.</li>
    <li>Sign in. If you were invited by email, use the link in your invitation. If you have a GitHub account, you can sign in with that.</li>
    <li>Fill in the title, type of entry, top tag and a short description. Everything else is optional.</li>
    <li>Click <b>Save</b>. The website updates by itself within a couple of minutes.</li>
  </ol>
  <h2>Fix or improve an entry</h2>
  <p>Open the entry and click <b>Edit this entry</b> at the bottom. Make your changes and click <b>Save</b>.</p>
  <h2>Add a new top tag</h2>
  <p>Top tags are the branches of the map. In the editor, open <b>Top tags</b> in the menu and add one. It then appears in the Top tag list when you edit an entry.</p>
  <div class="callout"><p>Every change is saved with its full history, so nothing is lost by mistake and anything can be undone.</p></div>
  <h2>Getting invited</h2>
  <p>Ask an existing editor to invite you. They can add you as a collaborator by email in the editor's settings.</p>
</main>
${footer("../")}`,
}));

write("404.html", layout({
  title: "Page not found", prefix: "/" + config.repo.split("/")[1] + "/", active: null,
  body: `<main class="page"><h1>Page not found</h1><p class="lead">That page doesn't exist. It may have been renamed. <a href="/${config.repo.split("/")[1]}/">Go to the map</a>.</p></main>`,
}));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

console.log(`Built ${entries.length} entries under ${topicList.length} top tags into _site/`);
