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
  const head = (crumb, title) => `<div class="ed-head"><p class="crumb">${esc(crumb)}</p><button type="button" class="ed-x" data-close aria-label="Close">&times;</button></div><h2>${esc(title)}</h2>`;

  // ---------- the entry form ----------
  function entryForm(mode, v = {}) {
    const topics = topicNames();
    const topic = v.top_tag || topics[0] || "";
    const typeBtn = (val, label, hint) => `<label class="seg-opt"><input type="radio" name="ed-type" value="${val}" ${String(v.type || "").toLowerCase() === val.toLowerCase() ? "checked" : ""}><span><b>${label}</b><small>${hint}</small></span></label>`;
    const editor = !!me;
    return `${head(mode === "add" ? "New entry" : "Editing", mode === "add" ? "Add an entry" : "Edit entry")}
      ${editor ? "" : `<p class="ed-note">Anyone can ${mode === "add" ? "suggest an entry" : "suggest changes"}. An editor checks it before it appears.</p>`}
      <form id="ed-form" novalidate>
        <label class="fld"><span>Title</span><input id="ed-title" maxlength="150" value="${esc(v.title || "")}" placeholder="A short, plain-English headline" autofocus></label>
        <fieldset class="fld"><legend>Type of entry</legend><div class="seg">
          ${typeBtn("Explainer", "Explainer", "Background on a topic")}
          ${typeBtn("Learning", "Learning", "Something we found out")}
          ${typeBtn("Issue", "Issue", "A problem")}
        </div></fieldset>
        <fieldset class="fld" id="ed-status-f" ${String(v.type || "").toLowerCase() === "issue" ? "" : "hidden"}><legend>Status</legend><div class="seg seg-small">
          <label class="seg-opt"><input type="radio" name="ed-status" value="Open" ${String(v.status || "Open").toLowerCase() === "open" ? "checked" : ""}><span><b>Open</b></span></label>
          <label class="seg-opt"><input type="radio" name="ed-status" value="Resolved" ${String(v.status || "").toLowerCase() === "resolved" ? "checked" : ""}><span><b>Resolved</b></span></label>
        </div></fieldset>
        <label class="fld"><span>Top tag</span><select id="ed-topic">
          ${topics.map(t => `<option ${t === topic ? "selected" : ""}>${esc(t)}</option>`).join("")}
          ${topic && !topics.includes(topic) ? `<option selected>${esc(topic)}</option>` : ""}
          <option value="__new">+ New top tag…</option></select></label>
        <label class="fld" id="ed-newtopic-f" hidden><span>New top tag name</span><input id="ed-newtopic" maxlength="100" placeholder="e.g. Heat pumps"></label>
        <div class="fld">
          <div class="fld-row"><label for="ed-body">Text</label>
            <div class="tabs" role="group" aria-label="Text view"><button type="button" data-view="write" aria-pressed="true">Write</button><button type="button" data-view="preview" aria-pressed="false">Preview</button></div></div>
          <textarea id="ed-body" rows="11" placeholder="Start with a one-paragraph summary. It's shown on the map and in search.&#10;&#10;Add as much detail below as you like.">${esc(v.body || "")}</textarea>
          <div id="ed-preview" class="prose ed-preview" hidden></div>
          <p class="fld-hint">Formatting: **bold**, a dash for a list item, ## for a heading, [link text](https://…)</p>
        </div>
        <details class="more" ${(v.tags || []).length || (v.related || []).length ? "open" : ""}><summary>More options</summary>
          <label class="fld"><span>Tags</span><input id="ed-tags" value="${esc((v.tags || []).join(", "))}" placeholder="Comma separated, e.g. V2G, EV"></label>
          <div class="fld"><label for="ed-rel-q">Related entries</label>
            <input id="ed-rel-q" type="search" placeholder="Search for entries to link">
            <ul id="ed-rel" class="rel-list"></ul></div>
          <label class="fld"><span>Contributors</span><input id="ed-contrib" value="${esc((v.contributors || (me ? [me.name] : [])).join(", "))}" placeholder="Comma separated names"></label>
        </details>
        ${editor ? "" : `<label class="fld"><span>Your name <small>(optional)</small></span><input id="ed-name" maxlength="80" autocomplete="name"></label>
          <div class="hp" aria-hidden="true"><label>Website <input id="ed-website" tabindex="-1" autocomplete="off"></label></div>
          ${CFG.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${esc(CFG.turnstileSiteKey)}"></div>` : ""}`}
        <p id="ed-error" class="ed-error" role="alert" hidden></p>
        <div class="ed-actions"><button type="button" class="btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn-primary">${editor ? (mode === "add" ? "Publish entry" : "Save changes") : "Send suggestion"}</button></div>
      </form>`;
  }

  function wireForm(mode, v = {}) {
    const f = document.getElementById("ed-form");
    const $ = id => document.getElementById(id);
    const related = new Set(v.related || []);
    // Issue status only for issues
    f.querySelectorAll('input[name="ed-type"]').forEach(r => r.addEventListener("change", () => { $("ed-status-f").hidden = r.value !== "Issue" || !r.checked; }));
    // New top tag
    $("ed-topic").addEventListener("change", e => { $("ed-newtopic-f").hidden = e.target.value !== "__new"; if (e.target.value === "__new") $("ed-newtopic").focus(); });
    // Write / preview
    f.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", async () => {
      const preview = b.dataset.view === "preview";
      f.querySelectorAll("[data-view]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      $("ed-body").hidden = preview; $("ed-preview").hidden = !preview;
      if (preview) {
        $("ed-preview").innerHTML = "<p class='fld-hint'>Loading preview…</p>";
        await loadMarked();
        $("ed-preview").innerHTML = window.marked ? window.marked.parse($("ed-body").value || "*Nothing written yet.*") : esc($("ed-body").value);
      }
    }));
    // Related entries: chosen ones first, then search matches
    const relList = () => {
      const q = $("ed-rel-q").value.trim();
      const chosen = [...related];
      let matches = [];
      if (q) matches = window.KBSearch.search(SEARCH, q).results.map(r => r.entry.title).filter(t => !related.has(t) && t !== $("ed-title").value).slice(0, 6);
      $("ed-rel").innerHTML = [...chosen.map(t => [t, true]), ...matches.map(t => [t, false])]
        .map(([t, on]) => `<li><label><input type="checkbox" value="${esc(t)}" ${on ? "checked" : ""}> ${esc(t)}</label></li>`).join("")
        || `<li class="fld-hint">${q ? "No matching entries." : "Type to find entries to link."}</li>`;
    };
    $("ed-rel-q").addEventListener("input", relList);
    $("ed-rel").addEventListener("change", e => { if (e.target.checked) related.add(e.target.value); else related.delete(e.target.value); });
    relList();
    if (window.turnstile && CFG.turnstileSiteKey) window.turnstile.render(f.querySelector(".cf-turnstile"));

    f.addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("ed-error");
      const say = msg => { err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({ block: "nearest" }); };
      const type = (f.querySelector('input[name="ed-type"]:checked') || {}).value;
      const topic = $("ed-topic").value === "__new" ? $("ed-newtopic").value.trim() : $("ed-topic").value;
      if (!$("ed-title").value.trim()) { say("Please give the entry a title."); $("ed-title").focus(); return; }
      if (!type) { say("Please choose a type of entry."); return; }
      if (!topic) { say("Please name the new top tag."); $("ed-newtopic").focus(); return; }
      say("");
      const btn = f.querySelector("button[type=submit]");
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = "Saving…";
      try {
        const out = await api("/api/entries", { body: {
          id: v.id || undefined, sha: v.sha || undefined,
          name: $("ed-name") ? $("ed-name").value : undefined,
          website: $("ed-website") ? $("ed-website").value : undefined,
          turnstile: f.querySelector('[name="cf-turnstile-response"]') ? f.querySelector('[name="cf-turnstile-response"]').value : undefined,
          entry: {
            title: $("ed-title").value, type, top_tag: topic,
            status: type === "Issue" ? (f.querySelector('input[name="ed-status"]:checked') || {}).value : undefined,
            body: $("ed-body").value, tags: $("ed-tags").value.split(","), related: [...related],
            contributors: $("ed-contrib").value.split(","),
          },
        } });
        done(out.mode === "published"
          ? { title: mode === "add" ? "Entry published" : "Changes saved", text: "It will show on the map in about two minutes, once the site has rebuilt. Reload the page then to see it." }
          : { title: "Suggestion sent", text: "Thank you. An editor will check it before it appears on the map." });
      } catch (x) {
        say(x.message);
        btn.disabled = false; btn.textContent = label;
      }
    });
  }

  function done({ title, text }) {
    show(`<div class="ed-done"><div class="ed-tick" aria-hidden="true">✓</div><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <button type="button" class="btn-primary" data-close>Back to the map</button></div>`);
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
    show(`${head("Editing", "Editing isn't switched on yet")}
      <p>Adding and editing inside the map needs the save service to be set up. Until then, use the separate editor.</p>
      ${fallbackUrl ? `<p><a class="btn-primary" href="${esc(fallbackUrl)}" target="_blank" rel="noopener">Open the editor</a></p>` : ""}`);
  }

  function openAdd(topic) {
    if (!CFG.api) return notConnected(CFG.newUrl);
    const v = { top_tag: topic || "" };
    show(entryForm("add", v)); wireForm("add", v);
  }

  async function openEdit(id) {
    if (!CFG.api) { const it = entryById(id); return notConnected(it && it.editUrl); }
    show(`${head("Editing", "Loading entry…")}<p class="fld-hint">Getting the latest version…</p>`);
    try {
      const v = await api(`/api/entry?id=${encodeURIComponent(id)}`);
      show(entryForm("edit", v)); wireForm("edit", v);
    } catch (x) {
      show(`${head("Editing", "Couldn't open this entry")}<p>${esc(x.message)}</p>`);
    }
  }

  function openRename(name) {
    show(`${head("Top tag", "Rename top tag")}
      <form id="ed-rename" novalidate>
        <p>Every entry under <b>${esc(name)}</b> moves to the new name.</p>
        <label class="fld"><span>New name</span><input id="ed-rename-to" maxlength="100" value="${esc(name)}" autofocus></label>
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
        done({ title: "Top tag renamed", text: `${out.changed} entr${out.changed === 1 ? "y" : "ies"} moved to “${to}”. The map updates in about two minutes.` });
      } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; btn.textContent = "Rename"; }
    });
  }

  async function openTools() {
    show(`${head("Signed in", `Editor tools`)}
      <p>Signed in as <b>${esc(me.name)}</b>${me.admin ? " (admin)" : ""}.</p>
      <h3>Suggestions to review</h3><div id="ed-sugg"><p class="fld-hint">Loading…</p></div>
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
        out.innerHTML = `<p>Send ${esc(name)} this personal link. Opening it signs them in on that device. It works in about two minutes.</p>
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
          <div class="ed-actions"><button type="button" class="btn-ghost" data-reject="${s.number}">Reject</button><button type="button" class="btn-primary" data-approve="${s.number}">Approve and publish</button></div>
        </div>`).join("") : `<p class="fld-hint">Nothing waiting. New suggestions show up here.</p>`;
    } catch (x) { box.innerHTML = `<p class="ed-error">${esc(x.message)}</p>`; }
  }

  async function review(n, action, btn) {
    const card = btn.closest(".sugg");
    card.querySelectorAll("button").forEach(b => b.disabled = true);
    btn.textContent = action === "approve" ? "Publishing…" : "Rejecting…";
    try {
      await api(`/api/suggestions/${n}/${action}`, { body: {} });
      card.innerHTML = `<p class="fld-hint">${action === "approve" ? "Approved. It appears on the map in about two minutes." : "Rejected."}</p>`;
    } catch (x) {
      card.querySelectorAll("button").forEach(b => b.disabled = false);
      btn.textContent = action === "approve" ? "Approve and publish" : "Reject";
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
    try { setMe(await api("/api/me")); if (key) openTools(); }
    catch (x) { if (x.status === 401) { store.set(null); if (key) show(`${head("Sign in", "That sign-in link didn't work")}<p>It may be new (links work about two minutes after they're made) or it may have been removed. Ask an editor for a new one.</p>`); } }
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

  signIn();
  const start = new URLSearchParams(location.search);
  if (start.has("add")) openAdd(start.get("add") || "");
  else if (start.get("edit")) openEdit(start.get("edit"));
})();
