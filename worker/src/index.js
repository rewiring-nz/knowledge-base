// Save service for the knowledge base website, run as a Cloudflare Worker.
//
// Editors (people with a personal key, listed in editors.json) publish straight to the repository.
// Everyone else's additions and changes become suggestions (pull requests labelled "suggestion")
// that an editor approves or rejects from the map.
import yaml from "js-yaml";

const TYPES = ["Explainer", "Learning", "Issue"];
const STATUSES = ["Open", "Resolved"];
const API = "https://api.github.com";

// ---------- small helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

const utf8ToB64 = s => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64ToUtf8 = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const slugify = s => String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 80) || "entry";
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const cleanList = (v, maxItems, maxLen) => (Array.isArray(v) ? v : String(v || "").split(","))
  .map(s => clean(s, maxLen)).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).slice(0, maxItems);

// ---------- GitHub ----------
function github(env) {
  const repo = env.REPO, branch = env.BRANCH || "main";
  async function gh(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "knowledge-base-save-service",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new HttpError(res.status === 404 ? 404 : 502, data.message || `GitHub answered ${res.status}`); e.github = true; throw e; }
    return data;
  }
  async function readFile(path, ref = branch) {
    try {
      const f = await gh("GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`);
      return { text: b64ToUtf8(f.content), sha: f.sha };
    } catch (e) { if (e.status === 404) return null; throw e; }
  }
  async function listDir(path, ref = branch) {
    try { return await gh("GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`); }
    catch (e) { if (e.status === 404) return []; throw e; }
  }
  // One commit that writes (or deletes, content: null) several files at once.
  async function commitFiles(files, message, author, onBranch = branch) {
    const ref = await gh("GET", `/repos/${repo}/git/ref/heads/${onBranch}`);
    const base = ref.object.sha;
    const baseCommit = await gh("GET", `/repos/${repo}/git/commits/${base}`);
    const tree = await gh("POST", `/repos/${repo}/git/trees`, {
      base_tree: baseCommit.tree.sha,
      tree: files.map(f => f.content === null
        ? { path: f.path, mode: "100644", type: "blob", sha: null }
        : { path: f.path, mode: "100644", type: "blob", content: f.content }),
    });
    const commit = await gh("POST", `/repos/${repo}/git/commits`, {
      message, tree: tree.sha, parents: [base],
      ...(author ? { author: { name: author, email: "knowledge-base-editor@users.noreply.github.com" } } : {}),
    });
    await gh("PATCH", `/repos/${repo}/git/refs/heads/${onBranch}`, { sha: commit.sha });
    return commit.sha;
  }
  return { gh, readFile, listDir, commitFiles, repo, branch };
}

// ---------- entry files ----------
function parseEntry(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let data = {};
  try { data = m ? yaml.load(m[1]) || {} : {}; } catch { data = {}; }
  return { data, body: (m ? m[2] : text).trim() };
}

const MANAGED = ["title", "type", "top_tag", "status", "tags", "related", "contributors", "image"];
function serializeEntry(e, keep = {}) {
  const d = { title: e.title, type: e.type, top_tag: e.top_tag };
  if (e.type === "Issue" && e.status) d.status = e.status;
  if (e.tags.length) d.tags = e.tags;
  if (e.related.length) d.related = e.related;
  if (e.contributors.length) d.contributors = e.contributors;
  if (e.image) d.image = e.image;
  for (const [k, v] of Object.entries(keep)) if (!MANAGED.includes(k)) d[k] = v; // keep any other settings as they were
  return `---\n${yaml.dump(d, { flowLevel: 1, lineWidth: -1 })}---\n\n${e.body}\n`;
}

const topicFile = name => `---\n${yaml.dump({ name }, { lineWidth: -1 })}---\n`;

function validateEntry(input) {
  const e = input || {};
  const title = clean(e.title, 150);
  if (!title) fail(400, "Please give the entry a title.");
  const type = TYPES.find(t => t.toLowerCase() === String(e.type || "").toLowerCase().trim());
  if (!type) fail(400, "Please choose a type of entry: Explainer, Learning or Issue.");
  const top_tag = clean(e.top_tag, 100);
  if (!top_tag) fail(400, "Please choose a top tag.");
  const status = type === "Issue" ? (STATUSES.find(s => s.toLowerCase() === String(e.status || "").toLowerCase().trim()) || "Open") : undefined;
  const body = clean(e.body, 50000).replace(/\r\n/g, "\n");
  return {
    title, type, status, top_tag, body,
    tags: cleanList(e.tags, 20, 50),
    related: cleanList(e.related, 30, 150),
    contributors: cleanList(e.contributors, 10, 80),
    image: clean(e.image, 300),
  };
}

// ---------- editors ----------
async function loadEditors(g) {
  const f = await g.readFile("editors.json");
  try { return { list: f ? JSON.parse(f.text) : [], sha: f && f.sha }; } catch { return { list: [], sha: f && f.sha }; }
}
async function whoIs(req, g) {
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const hash = await sha256(m[1].trim());
  const { list } = await loadEditors(g);
  const ed = list.find(x => x.hash === hash && !x.removed);
  return ed ? { name: ed.name, admin: !!ed.admin } : null;
}
const requireEditor = me => { if (!me) fail(401, "Only editors can do this. Ask an editor for a personal sign-in link."); return me; };

async function checkTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token || "");
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = await r.json().catch(() => ({}));
  if (!out.success) fail(400, "Please complete the 'I'm not a robot' check and try again.");
}

// ---------- routes ----------
async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const g = github(env);
  const body = req.method === "POST" ? await req.json().catch(() => fail(400, "The request wasn't valid JSON.")) : null;
  const me = await whoIs(req, g);

  if (req.method === "GET" && path === "/api/me") {
    return requireEditor(me);
  }

  // The current version of one entry, for editing
  if (req.method === "GET" && path === "/api/entry") {
    const id = url.searchParams.get("id") || "";
    if (!/^[\w-]{1,120}$/.test(id)) fail(400, "Unknown entry.");
    const f = await g.readFile(`entries/${id}.md`);
    if (!f) fail(404, "That entry no longer exists.");
    const { data, body: text } = parseEntry(f.text);
    return {
      id, sha: f.sha, body: text,
      title: data.title || "", type: data.type || "", status: data.status || "", top_tag: data.top_tag || "",
      tags: cleanList(data.tags, 50, 100), related: cleanList(data.related, 50, 200),
      contributors: cleanList(data.contributors, 20, 100), image: data.image || "",
    };
  }

  // Add or change an entry. Editors publish; anyone else sends a suggestion.
  if (req.method === "POST" && path === "/api/entries") {
    if (body.website) return { mode: "suggested" }; // honeypot field: quietly ignore bots
    const entry = validateEntry(body.entry);
    const id = body.id ? String(body.id) : null;
    if (id && !/^[\w-]{1,120}$/.test(id)) fail(400, "Unknown entry.");

    let filePath, keep = {}, existing = null;
    if (id) {
      filePath = `entries/${id}.md`;
      existing = await g.readFile(filePath);
      if (!existing) fail(404, "That entry no longer exists. It may have been renamed or removed.");
      if (body.sha && existing.sha !== body.sha) fail(409, "Someone else changed this entry while you were editing. Copy your text, reload the page and try again.");
      keep = parseEntry(existing.text).data;
    } else {
      const names = new Set((await g.listDir("entries")).map(f => f.name));
      const base = slugify(entry.title);
      let n = 1, name = `${base}.md`;
      while (names.has(name)) name = `${base}-${++n}.md`;
      filePath = `entries/${name}`;
    }

    const files = [{ path: filePath, content: serializeEntry(entry, keep) }];
    const topics = await g.listDir("topics");
    const topicTexts = await Promise.all(topics.filter(t => t.name.endsWith(".md")).map(t => g.readFile(t.path)));
    const known = topicTexts.filter(Boolean).map(t => String(parseEntry(t.text).data.name || "").toLowerCase());
    if (!known.includes(entry.top_tag.toLowerCase())) files.push({ path: `topics/${slugify(entry.top_tag)}.md`, content: topicFile(entry.top_tag) });

    if (me) {
      await g.commitFiles(files, `${id ? "Update" : "Add"} entry: ${entry.title}`, `${me.name} (via the map)`);
      return { mode: "published", id: filePath.replace(/^entries\/|\.md$/g, "") };
    }

    // Suggestion: its own branch and pull request
    await checkTurnstile(env, body.turnstile, req.headers.get("CF-Connecting-IP"));
    const who = clean(body.name, 80) || "Someone";
    const branchName = `suggestion/${slugify(entry.title).slice(0, 40)}-${Date.now().toString(36)}`;
    const main = await g.gh("GET", `/repos/${g.repo}/git/ref/heads/${g.branch}`);
    await g.gh("POST", `/repos/${g.repo}/git/refs`, { ref: `refs/heads/${branchName}`, sha: main.object.sha });
    await g.commitFiles(files, `Suggest ${id ? "changes to" : "new entry"}: ${entry.title}`, `${who} (suggestion)`, branchName);
    const pr = await g.gh("POST", `/repos/${g.repo}/pulls`, {
      title: `Suggestion: ${entry.title}`, head: branchName, base: g.branch,
      body: `Suggested by: ${who}\n\n${id ? `Changes to \`${filePath}\`` : "New entry"}, sent from the map. Approve or reject it from the map's editor tools.`,
    });
    await g.gh("POST", `/repos/${g.repo}/issues/${pr.number}/labels`, { labels: ["suggestion"] });
    return { mode: "suggested", number: pr.number, id: filePath.replace(/^entries\/|\.md$/g, "") };
  }

  // Whether suggestions have been approved yet. Open to anyone; says nothing about their content.
  if (req.method === "GET" && path === "/api/suggestions/status") {
    const nums = String(url.searchParams.get("n") || "").split(",").filter(n => /^\d{1,7}$/.test(n)).slice(0, 20);
    const statuses = {};
    for (const n of nums) {
      try {
        const pr = await g.gh("GET", `/repos/${g.repo}/pulls/${n}`);
        if (!pr.labels.some(l => l.name === "suggestion")) continue;
        statuses[n] = pr.merged_at ? { state: "approved", at: pr.merged_at } : pr.state === "closed" ? { state: "rejected" } : { state: "waiting" };
      } catch (e) { if (e.status !== 404) throw e; }
    }
    return { statuses };
  }

  // Rename a top tag everywhere it's used
  if (req.method === "POST" && path === "/api/topics/rename") {
    requireEditor(me);
    const from = clean(body.from, 100), to = clean(body.to, 100);
    if (!from || !to) fail(400, "Please give the new name.");
    if (from === to) return { changed: 0 };
    const files = [];
    for (const t of (await g.listDir("topics")).filter(t => t.name.endsWith(".md"))) {
      const f = await g.readFile(t.path);
      const { data, body: text } = parseEntry(f.text);
      if (String(data.name || "").toLowerCase() === from.toLowerCase()) {
        files.push({ path: t.path, content: `---\n${yaml.dump({ ...data, name: to }, { lineWidth: -1 })}---\n${text ? "\n" + text + "\n" : ""}` });
      }
    }
    let changed = 0;
    for (const e of (await g.listDir("entries")).filter(e => e.name.endsWith(".md") && e.name !== "README.md")) {
      const f = await g.readFile(e.path);
      const { data, body: text } = parseEntry(f.text);
      if (String(data.top_tag || "").toLowerCase() === from.toLowerCase()) {
        const entry = validateEntry({ ...data, top_tag: to, body: text });
        files.push({ path: e.path, content: serializeEntry(entry, data) });
        changed++;
      }
    }
    if (!files.length) fail(404, `There's no top tag called "${from}".`);
    if (!files.some(f => f.path.startsWith("topics/"))) files.push({ path: `topics/${slugify(to)}.md`, content: topicFile(to) });
    await g.commitFiles(files, `Rename top tag "${from}" to "${to}"`, `${me.name} (via the map)`);
    return { changed };
  }

  // Suggestions waiting for review
  if (req.method === "GET" && path === "/api/suggestions") {
    requireEditor(me);
    const prs = await g.gh("GET", `/repos/${g.repo}/pulls?state=open&per_page=50`);
    const out = [];
    for (const pr of prs.filter(p => p.labels.some(l => l.name === "suggestion"))) {
      const changed = await g.gh("GET", `/repos/${g.repo}/pulls/${pr.number}/files`);
      const file = changed.find(f => f.filename.startsWith("entries/"));
      const content = file ? await g.readFile(file.filename, pr.head.sha) : null;
      const parsed = content ? parseEntry(content.text) : { data: {}, body: "" };
      const d = parsed.data;
      out.push({
        number: pr.number, created: pr.created_at, isEdit: file ? file.status === "modified" : false,
        id: file ? file.filename.replace(/^entries\/|\.md$/g, "") : "",
        by: (pr.body || "").match(/^Suggested by: (.*)$/m)?.[1] || "Someone",
        title: d.title || pr.title, type: d.type || "", top_tag: d.top_tag || "", status: d.status || "",
        tags: cleanList(d.tags, 50, 100), related: cleanList(d.related, 50, 200), contributors: cleanList(d.contributors, 20, 100),
        body: parsed.body,
      });
    }
    return { suggestions: out };
  }

  const review = path.match(/^\/api\/suggestions\/(\d+)\/(approve|reject)$/);
  if (req.method === "POST" && review) {
    requireEditor(me);
    const n = review[1];
    const pr = await g.gh("GET", `/repos/${g.repo}/pulls/${n}`);
    if (!pr.labels.some(l => l.name === "suggestion")) fail(400, "That isn't a suggestion.");
    if (review[2] === "approve") {
      try { await g.gh("PUT", `/repos/${g.repo}/pulls/${n}/merge`, { merge_method: "squash", commit_title: `${pr.title} (approved by ${me.name})` }); }
      catch (e) { if (e.github) fail(409, "This suggestion clashes with a newer change. Reject it and add the entry by hand instead."); throw e; }
    } else {
      await g.gh("PATCH", `/repos/${g.repo}/pulls/${n}`, { state: "closed" });
    }
    await g.gh("DELETE", `/repos/${g.repo}/git/refs/heads/${pr.head.ref}`).catch(() => {});
    return { ok: true };
  }

  // Invite an editor: makes a personal sign-in link. Only the link holder can use it.
  if (req.method === "POST" && path === "/api/editors") {
    if (!requireEditor(me).admin) fail(403, "Only admins can invite editors.");
    const name = clean(body.name, 80);
    if (!name) fail(400, "Please give the editor's name.");
    const token = randomToken();
    const { list } = await loadEditors(g);
    list.push({ name, hash: await sha256(token), admin: !!body.admin, added: new Date().toISOString().slice(0, 10), addedBy: me.name });
    await g.commitFiles([{ path: "editors.json", content: JSON.stringify(list, null, 2) + "\n" }], `Invite editor: ${name}`, `${me.name} (via the map)`);
    return { link: `${env.SITE_URL}?key=${token}` };
  }

  // A description of the entry format, for people's AI tools
  if (req.method === "GET" && (path === "" || path === "/api")) {
    return {
      service: "Knowledge base save service",
      guide: `${env.SITE_URL}ai-guide/`,
      types: TYPES, statuses: STATUSES,
    };
  }

  fail(404, "Not found.");
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      return json(await route(req, env), 200, cors);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError && !err.github ? err.message : "Saving didn't work. Please try again in a minute.";
      if (status >= 500) console.error(err);
      return json({ error: message }, status, cors);
    }
  },
};

// For tests
export { parseEntry, serializeEntry, validateEntry, slugify };
