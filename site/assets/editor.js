// Adding and editing entries inside the map, in the same side panel where entries open.
// Talks to the save service (worker/) set as "api" in site/config.json. Editors sign in with a
// personal link (?key=...); everyone else's additions and changes are sent as suggestions.
(function () {
  const CFG = window.KB_CONFIG || {};
  const KB = window.KB, SEARCH = window.KB_SEARCH || [];
  const esc = window.KBSearch.escHtml;
  const ed = document.getElementById("editor"), panel = document.getElementById("panel"), main = document.querySelector(".main");
  const whoBtn = document.getElementById("who");
  const KEY = "kb-editor-key";
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} },
  };
  let me = null;
  const topicNames = () => KB.topics.map(t => t.name);
  const entryById = id => KB.topics.flatMap(t => t.items).find(i => i.id === id);

  async function api(path, opts = {}) {
    const key = store.get();
    let res;
    try {
      res = await fetch(CFG.api.replace(/\/$/, "") + path, {
        method: opts.body ? "POST" : "GET",
        headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(key ? { Authorization: `Bearer ${key}` } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch { throw new Error("Couldn't reach the save service. Check your internet connection and try again."); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Something went wrong. Please try again."); e.status = res.status; throw e; }
    return data;
  }

  // ---------- opening and closing the panel ----------
  function show(html) {
    ed.innerHTML = html;
    ed.hidden = false; panel.hidden = true;
    main.classList.add("editing");
    ed.scrollTop = 0;
    dirty = false;
    const first = ed.querySelector("[autofocus], input, select, textarea, button");
    if (first) first.focus({ preventScroll: true });
  }
  function close() {
    ed.hidden = true; ed.innerHTML = ""; panel.hidden = false;
    main.classList.remove("editing");
    if (window.KBMap) window.KBMap.render();
  }
  // Typing in a form marks it as having unsaved work, which clicking the map won't throw away.
  let dirty = false;
  ed.addEventListener("input", e => { if (e.target.closest("form")) dirty = true; });
  window.KBEditor = { closeIfIdle() { if (!ed.hidden && !dirty) { ed.hidden = true; ed.innerHTML = ""; panel.hidden = false; main.classList.remove("editing"); } } };
  const head = (title) => `<div class="ed-head"><h2>${esc(title)}</h2><button type="button" class="ed-x" data-close aria-label="Close">&times;</button></div>`;

  // ---------- the entry form ----------
  const ICON = {
    bold: `<b aria-hidden="true">B</b>`,
    heading: `<b aria-hidden="true">H</b>`,
    list: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="2.5" cy="4" r="1.3" fill="currentColor"/><circle cx="2.5" cy="8" r="1.3" fill="currentColor"/><circle cx="2.5" cy="12" r="1.3" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    link: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  };
  function entryForm(mode, v = {}) {
    const topics = topicNames();
    const topic = v.top_tag || topics[0] || "";
    const type = String(v.type || (mode === "add" ? "Explainer" : "")).toLowerCase();
    const status = String(v.status || "Open").toLowerCase();
    const typeOpt = (val, cls) => `<label class="seg-opt"><input type="radio" name="ed-type" value="${val}" ${type === val.toLowerCase() ? "checked" : ""}><span><i class="k ${cls}"></i>${val}</span></label>`;
    const editor = !!me;
    return `${head(mode === "add" ? "Add an entry" : "Edit entry")}
      <form id="ed-form" novalidate>
        <input id="ed-title" class="title-input" maxlength="150" value="${esc(v.title || "")}" placeholder="Title" aria-label="Title" autofocus>
        <div class="seg" role="radiogroup" aria-label="Type of entry">
          ${typeOpt("Explainer", "explainer")}${typeOpt("Learning", "learning")}${typeOpt("Issue", "issue")}
        </div>
        <div class="seg seg-small" id="ed-status-f" role="radiogroup" aria-label="Issue status" ${type === "issue" ? "" : "hidden"}>
          <label class="seg-opt"><input type="radio" name="ed-status" value="Open" ${status !== "resolved" ? "checked" : ""}><span><i class="k issue-open"></i>Open</span></label>
          <label class="seg-opt"><input type="radio" name="ed-status" value="Resolved" ${status === "resolved" ? "checked" : ""}><span><i class="k issue"></i>Resolved</span></label>
        </div>
        <label class="fld"><span>Top tag</span><select id="ed-topic">
          ${topics.map(t => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}
          ${topic && !topics.includes(topic) ? `<option selected>${esc(topic)}</option>` : ""}
          <option value="__new">+ New top tag</option></select></label>
        <input id="ed-newtopic" class="fld-input" maxlength="100" placeholder="New top tag name" aria-label="New top tag name" hidden>
        <div class="writer">
          <div class="writer-bar">
            <div class="tools-row" role="toolbar" aria-label="Formatting">
              <button type="button" data-fmt="bold" title="Bold" aria-label="Bold">${ICON.bold}</button>
              <button type="button" data-fmt="heading" title="Heading" aria-label="Heading">${ICON.heading}</button>
              <button type="button" data-fmt="list" title="List" aria-label="List">${ICON.list}</button>
              <button type="button" data-fmt="link" title="Link" aria-label="Link">${ICON.link}</button>
            </div>
            <div class="tabs" role="group" aria-label="View"><button type="button" data-view="write" aria-pressed="true">Write</button><button type="button" data-view="preview" aria-pressed="false">Preview</button></div>
          </div>
          <textarea id="ed-body" rows="11" placeholder="Write here…" aria-label="Text">${esc(v.body || "")}</textarea>
          <div id="ed-preview" class="prose ed-preview" hidden></div>
        </div>
        <details class="more" ${(v.tags || []).length || (v.related || []).length ? "open" : ""}><summary>Tags, related entries and contributors</summary>
          <label class="fld"><span>Tags</span><input id="ed-tags" value="${esc((v.tags || []).join(", "))}" placeholder="e.g. V2G, EV"></label>
          <div class="fld"><label for="ed-rel-q">Related entries</label>
            <input id="ed-rel-q" type="search" placeholder="Find an entry">
            <ul id="ed-rel" class="rel-list"></ul></div>
          <label class="fld"><span>Contributors</span><input id="ed-contrib" value="${esc((v.contributors || (me ? [me.name] : [])).join(", "))}" placeholder="Names"></label>
        </details>
        ${editor ? "" : `<label class="fld"><span>Your name</span><input id="ed-name" maxlength="80" autocomplete="name" placeholder="Optional"></label>
          <div class="hp" aria-hidden="true"><label>Website <input id="ed-website" tabindex="-1" autocomplete="off"></label></div>
          ${CFG.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(CFG.turnstileSiteKey)}"></div>` : ""}`}
        <p id="ed-error" class="ed-error" role="alert" hidden></p>
        <div class="ed-actions"><button type="button" class="btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn-primary">${editor ? (mode === "add" ? "Publish" : "Save") : "Send for review"}</button></div>
      </form>`;
  }

  // Formatting buttons insert the simple text markers the site turns into formatting.
  function format(ta, kind) {
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const sel = value.slice(a, b);
    let text, selA, selB;
    if (kind === "bold") { const inner = sel || "bold text"; text = `**${inner}**`; selA = a + 2; selB = selA + inner.length; }
    else if (kind === "link") { const inner = sel || "link text"; text = `[${inner}](https://)`; selA = a + inner.length + 3; selB = selA + 8; }
    else {
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      const block = value.slice(lineStart, b) || "";
      const prefix = kind === "heading" ? "## " : "- ";
      const lines = (block || "").split("\n").map(l => l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l);
      ta.setRangeText(lines.join("\n"), lineStart, b, "end");
      ta.focus(); ta.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    ta.setRangeText(text, a, b, "end");
    ta.setSelectionRange(selA, selB);
    ta.focus(); ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function wireForm(mode, v = {}) {
    const f = document.getElementById("ed-form");
    const $ = id => document.getElementById(id);
    const related = new Set(v.related || []);
    f.querySelectorAll('input[name="ed-type"]').forEach(r => r.addEventListener("change", () => { $("ed-status-f").hidden = !(r.checked && r.value === "Issue"); }));
    $("ed-topic").addEventListener("change", e => { $("ed-newtopic").hidden = e.target.value !== "__new"; if (e.target.value === "__new") $("ed-newtopic").focus(); });
    f.querySelectorAll("[data-fmt]").forEach(b => b.addEventListener("click", () => format($("ed-body"), b.dataset.fmt)));
    f.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", async () => {
      const preview = b.dataset.view === "preview";
      f.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      f.querySelector(".tools-row").style.visibility = preview ? "hidden" : "";
      $("ed-body").hidden = preview; $("ed-preview").hidden = !preview;
      if (preview) {
        await loadMarked();
        $("ed-preview").innerHTML = window.marked ? window.marked.parse($("ed-body").value || "") : esc($("ed-body").value);
      }
    }));
    const relList = () => {
      const q = $("ed-rel-q").value.trim();
      const matches = q ? window.KBSearch.search(SEARCH, q).results.map(r => r.entry.title).filter(t => !related.has(t) && t !== $("ed-title").value).slice(0, 6) : [];
      $("ed-rel").innerHTML = [...[...related].map(t => [t, true]), ...matches.map(t => [t, false])]
        .map(([t, on]) => `<li><label><input type="checkbox" value="${esc(t)}" ${on ? "checked" : ""}> ${esc(t)}</label></li>`).join("");
    };
    $("ed-rel-q").addEventListener("input", relList);
    $("ed-rel").addEventListener("change", e => { if (e.target.checked) related.add(e.target.value); else related.delete(e.target.value); });
    relList();
    if (window.turnstile && CFG.turnstileSiteKey) window.turnstile.render(f.querySelector(".cf-turnstile"));

    f.addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("ed-error");
      const say = (msg, focus) => { err.textContent = msg; err.hidden = !msg; if (focus) focus.focus(); };
      const type = (f.querySelector('input[name="ed-type"]:checked') || {}).value;
      const topic = $("ed-topic").value === "__new" ? $("ed-newtopic").value.trim() : $("ed-topic").value;
      if (!$("ed-title").value.trim()) return say("Add a title.", $("ed-title"));
      if (!type) return say("Choose Explainer, Learning or Issue.");
      if (!topic) return say("Name the new top tag.", $("ed-newtopic"));
      say("");
      const entry = {
        title: $("ed-title").value.trim(), type, top_tag: topic,
        status: type === "Issue" ? (f.querySelector('input[name="ed-status"]:checked') || {}).value : undefined,
        body: $("ed-body").value, tags: $("ed-tags").value.split(","), related: [...related],
        contributors: $("ed-contrib").value.split(","),
      };
      const btn = f.querySelector("button[type=submit]");
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const out = await api("/api/entries", { body: {
          id: v.id || undefined, sha: v.sha || undefined, entry,
          name: $("ed-name") ? $("ed-name").value : undefined,
          website: $("ed-website") ? $("ed-website").value : undefined,
          turnstile: f.querySelector('[name="cf-turnstile-response"]') ? f.querySelector('[name="cf-turnstile-response"]').value : undefined,
        } });
        if (!out.id) { close(); return toast("Sent for review"); } // ignored as a bot
        remember(out, entry, mode === "edit");
        dirty = false;
        close();
        await refreshPending();
        window.KBMap.selectItem(out.id);
        toast(out.mode === "published" ? (mode === "add" ? "Published" : "Saved") : "Sent for review");
      } catch (x) {
        say(x.message);
        btn.disabled = false; btn.textContent = label;
      }
    });
  }

  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  // ---------- changes not yet on the live site ----------
  // Kept on this device, and shown on the map in their own colour until the live site includes them.
  const PKEY = "kb-pending";
  const pendingStore = {
    get() { try { return JSON.parse(localStorage.getItem(PKEY) || "[]"); } catch { return []; } },
    set(v) { try { localStorage.setItem(PKEY, JSON.stringify(v)); } catch {} },
  };
  function remember(out, entry, isEdit) {
    const list = pendingStore.get().filter(p => p.id !== out.id);
    list.push({ id: out.id, number: out.number, kind: out.mode, isEdit, entry, savedAt: new Date().toISOString() });
    pendingStore.set(list);
  }
  const asList = v => (Array.isArray(v) ? v : String(v || "").split(",")).map(s => String(s).trim()).filter(Boolean);
  function toItem(e, id, kind, extra = {}) {
    const t = String(e.type || "").toLowerCase();
    const type = ["issue", "learning", "explainer"].includes(t) ? t : "learning";
    const body = String(e.body || "");
    const first = (body.split(/\n\s*\n/).map(s => s.trim()).find(s => s && !/^(#|!\[|<|---|\||```)/.test(s)) || "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "").trim();
    return {
      id, pending: kind, title: String(e.title || ""), type,
      status: type === "issue" ? (String(e.status || "").toLowerCase() === "resolved" ? "resolved" : "open") : undefined,
      top_tag: String(e.top_tag || "Uncategorised"), summary: first, text: body.replace(/[#*_`>]/g, " "), body,
      tags: asList(e.tags), related: asList(e.related), contributorsList: asList(e.contributors), contributors: asList(e.contributors).join(", "),
      ...extra,
    };
  }
  let lastShown = [];
  async function refreshPending() {
    if (!window.KBMap || !window.KBMap.applyPending) return;
    let list = pendingStore.get().filter(p => Date.now() - Date.parse(p.savedAt) < 30 * 864e5);
    const nums = list.filter(p => p.kind === "suggested" && p.number).map(p => p.number);
    if (CFG.api && nums.length) {
      try {
        const { statuses } = await api(`/api/suggestions/status?n=${nums.join(",")}`);
        list = list.filter(p => {
          const s = p.kind === "suggested" && statuses[p.number];
          if (!s) return true;
          if (s.state === "rejected") return false;
          if (s.state === "approved") { p.kind = "published"; p.savedAt = s.at; }
          return true;
        });
      } catch {}
    }
    // Once the live site was built after a change, the change is part of it
    list = list.filter(p => !(p.kind === "published" && KB.builtAt && KB.builtAt > p.savedAt));
    pendingStore.set(list);
    let shown = list.map(p => toItem(p.entry, p.id, p.kind === "published" ? "publishing" : "suggested", { number: p.number, isEdit: p.isEdit }));
    if (me) {
      try {
        const { suggestions } = await api("/api/suggestions");
        for (const s of suggestions.filter(s => s.id)) {
          shown = shown.filter(x => !(x.pending === "suggested" && x.number === s.number));
          if (!shown.some(x => x.id === s.id)) shown.push(toItem(s, s.id, "review", { by: s.by, number: s.number, isEdit: s.isEdit }));
        }
      } catch {}
    }
    if (shown.length) await loadMarked();
    shown.forEach(i => { i.html = window.marked ? window.marked.parse(i.body) : `<p>${esc(i.body)}</p>`; });
    lastShown = shown;
    window.KBMap.applyPending(shown);
    watchForUpdate(list.some(p => p.kind === "published"));
  }

  // While a change is publishing, check now and then whether the live site has been rebuilt.
  let watching;
  function watchForUpdate(on) {
    clearInterval(watching);
    if (!on) return;
    watching = setInterval(async () => {
      try {
        const b = await (await fetch("build.json?t=" + Date.now(), { cache: "no-store" })).json();
        if (b.builtAt && b.builtAt !== KB.builtAt) {
          clearInterval(watching);
          if (!document.querySelector(".site-updated")) document.body.insertAdjacentHTML("beforeend",
            `<div class="site-updated" role="status">The map has been updated <button type="button" onclick="location.reload()">Show it</button></div>`);
        }
      } catch {}
    }, 20000);
  }

  let markedLoading;
  function loadMarked() {
    if (window.marked) return Promise.resolve();
    markedLoading = markedLoading || new Promise(res => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js";
      s.onload = s.onerror = () => res();
      document.head.appendChild(s);
    });
    return markedLoading;
  }

  // ---------- actions ----------
  function notConnected(fallbackUrl) {
    show(`${head("Editing isn't switched on yet")}
      ${fallbackUrl ? `<p><a class="btn-primary" href="${esc(fallbackUrl)}" target="_blank" rel="noopener">Use the separate editor</a></p>` : ""}`);
  }

  function openAdd(topic) {
    if (!CFG.api) return notConnected(CFG.newUrl);
    const v = { top_tag: topic || "" };
    show(entryForm("add", v)); wireForm("add", v);
  }

  async function openEdit(id) {
    if (!CFG.api) { const it = entryById(id); return notConnected(it && it.editUrl); }
    show(`${head("Edit entry")}<p class="fld-hint">Loading…</p>`);
    try {
      const v = await api(`/api/entry?id=${encodeURIComponent(id)}`);
      show(entryForm("edit", v)); wireForm("edit", v);
    } catch (x) {
      show(`${head("Couldn't open this entry")}<p>${esc(x.message)}</p>`);
    }
  }

  function openRename(name) {
    show(`${head("Rename top tag")}
      <form id="ed-rename" novalidate>
        <label class="fld"><span>Name</span><input id="ed-rename-to" maxlength="100" value="${esc(name)}" autofocus></label>
        <p id="ed-error" class="ed-error" role="alert" hidden></p>
        <div class="ed-actions"><button type="button" class="btn-ghost" data-close>Cancel</button><button type="submit" class="btn-primary">Rename</button></div>
      </form>`);
    document.getElementById("ed-rename").addEventListener("submit", async e => {
      e.preventDefault();
      const to = document.getElementById("ed-rename-to").value.trim();
      const err = document.getElementById("ed-error");
      if (!to) { err.textContent = "Please give the new name."; err.hidden = false; return; }
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Renaming…";
      try {
        const out = await api("/api/topics/rename", { body: { from: name, to } });
        dirty = false; close(); toast(`Renamed. The map updates in a couple of minutes.`); watchForUpdate(true);
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = "Rename"; }
    });
  }

  async function openTools() {
    show(`${head("Editor tools")}
      <p>Signed in as <b>${esc(me.name)}</b>${me.admin ? " (admin)" : ""}.</p>
      <h3>Waiting for review</h3><div id="ed-sugg"><p class="fld-hint">Loading…</p></div>
      ${me.admin ? `<h3>Invite an editor</h3>
        <form id="ed-invite" class="ed-inline" novalidate>
          <label class="fld"><span>Their name</span><input id="ed-inv-name" maxlength="80"></label>
          <label class="check-row"><input type="checkbox" id="ed-inv-admin"> Can also invite editors</label>
          <button type="submit" class="btn-primary">Create sign-in link</button>
          <div id="ed-inv-out"></div>
        </form>` : ""}
      <h3>This device</h3><p><button type="button" class="linkish" data-signout>Sign out</button></p>`);
    loadSuggestions();
    const inv = document.getElementById("ed-invite");
    if (inv) inv.addEventListener("submit", async e => {
      e.preventDefault();
      const out = document.getElementById("ed-inv-out");
      const name = document.getElementById("ed-inv-name").value.trim();
      if (!name) { out.innerHTML = `<p class="ed-error">Please give their name.</p>`; return; }
      out.innerHTML = `<p class="fld-hint">Creating link…</p>`;
      try {
        const r = await api("/api/editors", { body: { name, admin: document.getElementById("ed-inv-admin").checked } });
        out.innerHTML = `<p>Send this link to ${esc(name)}. It signs them in.</p>
          <div class="copy-row"><input id="ed-inv-link" readonly value="${esc(r.link)}"><button type="button" class="btn-ghost" data-copy>Copy</button></div>`;
      } catch (x) { out.innerHTML = `<p class="ed-error">${esc(x.message)}</p>`; }
    });
  }

  async function loadSuggestions() {
    const box = document.getElementById("ed-sugg");
    try {
      const { suggestions } = await api("/api/suggestions");
      box.innerHTML = suggestions.length ? suggestions.map(s => `<div class="sugg" data-n="${s.number}">
          <p class="crumb">${s.isEdit ? "Changes to an entry" : "New entry"} · from ${esc(s.by)} · ${esc(String(s.created).slice(0, 10))}</p>
          <h4>${esc(s.title)}</h4>
          <p class="fld-hint">${esc(s.type)}${s.top_tag ? " · " + esc(s.top_tag) : ""}</p>
          <p class="sugg-body">${esc(s.body.slice(0, 400))}${s.body.length > 400 ? "…" : ""}</p>
          <div class="ed-actions"><button type="button" class="btn-ghost" data-reject="${s.number}">Reject</button><button type="button" class="btn-primary" data-approve="${s.number}">Approve</button></div>
        </div>`).join("") : `<p class="fld-hint">Nothing waiting.</p>`;
    } catch (x) { box.innerHTML = `<p class="ed-error">${esc(x.message)}</p>`; }
  }

  async function review(n, action, btn) {
    const card = btn.closest(".sugg, .pending-note");
    card.querySelectorAll("button").forEach(b => b.disabled = true);
    btn.textContent = action === "approve" ? "Publishing…" : "Rejecting…";
    try {
      await api(`/api/suggestions/${n}/${action}`, { body: {} });
      if (card.matches(".sugg")) card.innerHTML = `<p class="fld-hint">${action === "approve" ? "Approved" : "Rejected"}</p>`;
      toast(action === "approve" ? "Approved" : "Rejected");
      // An approved suggestion stays on the map, now marked as publishing, until the site has rebuilt
      const item = lastShown.find(x => String(x.number) === String(n));
      if (action === "approve" && item) {
        const list = pendingStore.get().filter(p => p.id !== item.id);
        list.push({ id: item.id, kind: "published", isEdit: item.isEdit, savedAt: new Date().toISOString(),
          entry: { title: item.title, type: item.type, status: item.status, top_tag: item.top_tag, body: item.body, tags: item.tags, related: item.related, contributors: item.contributorsList } });
        pendingStore.set(list);
      }
      refreshPending();
    } catch (x) {
      card.querySelectorAll("button").forEach(b => b.disabled = false);
      btn.textContent = action === "approve" ? "Approve" : "Reject";
      card.insertAdjacentHTML("beforeend", `<p class="ed-error">${esc(x.message)}</p>`);
    }
  }

  // ---------- sign-in ----------
  function setMe(who) {
    me = who;
    document.body.classList.toggle("is-editor", !!me);
    if (whoBtn) { whoBtn.hidden = !me; whoBtn.textContent = me ? `${me.name} · Editor tools` : ""; }
  }
  async function signIn() {
    const params = new URLSearchParams(location.search);
    const key = params.get("key");
    if (key) {
      store.set(key);
      params.delete("key");
      history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : ""));
    }
    if (!CFG.api || !store.get()) return;
    try { setMe(await api("/api/me")); if (key) openTools(); refreshPending(); }
    catch (x) { if (x.status === 401) { store.set(null); if (key) show(`${head("That sign-in link didn't work")}<p>Ask an editor for a new one.</p>`); } }
  }

  // ---------- wiring ----------
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-add], [data-edit], [data-rename-topic], [data-close], [data-signout], [data-approve], [data-reject], [data-copy]");
    if (!t) return;
    if (t.matches("[data-add]")) { e.preventDefault(); openAdd(t.dataset.add); }
    else if (t.matches("[data-edit]")) { e.preventDefault(); openEdit(t.dataset.edit); }
    else if (t.matches("[data-rename-topic]")) openRename(t.dataset.renameTopic);
    else if (t.matches("[data-close]")) close();
    else if (t.matches("[data-signout]")) { store.set(null); setMe(null); close(); }
    else if (t.matches("[data-approve]")) review(t.dataset.approve, "approve", t);
    else if (t.matches("[data-reject]")) review(t.dataset.reject, "reject", t);
    else if (t.matches("[data-copy]")) {
      const input = document.getElementById("ed-inv-link");
      const ok = () => { t.textContent = "Copied"; };
      navigator.clipboard && navigator.clipboard.writeText(input.value).then(ok, () => { input.select(); });
    }
  });
  if (whoBtn) whoBtn.addEventListener("click", () => me && openTools());
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !ed.hidden && !e.target.closest("textarea, input")) close(); });

  refreshPending();
  signIn();
  const start = new URLSearchParams(location.search);
  if (start.has("add")) openAdd(start.get("add") || "");
  else if (start.get("edit")) openEdit(start.get("edit"));
  if (start.has("add") || start.has("edit")) { start.delete("add"); start.delete("edit"); history.replaceState(null, "", location.pathname + (start.toString() ? "?" + start : "")); }
})();
