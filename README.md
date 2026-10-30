# Electrification Knowledge Base

A public, plain-English knowledge base about electrification, with an interactive mind map, search and one page per entry.

**Website:** https://rewiring-nz.github.io/knowledge-base/

## Adding or editing entries

Click **Add an entry** on the website, or **Edit this entry** on any entry. A form opens beside the map.

- **Anyone** can send additions and changes. They arrive as suggestions for an editor to approve.
- **Editors** sign in once with a personal link and publish straight away. They review suggestions, rename top tags and (admins) invite editors from **Editor tools** in the header.
- **AI assistants** follow [AI-GUIDE.md](AI-GUIDE.md), also published at `/ai-guide/` with `/llms.txt`, `/api/entries.json`, `/api/topics.json` and `/openapi.yaml`.
- [Pages CMS](https://app.pagescms.org) also works as a backup editor (`.pages.yml`).

Every save is a commit here, so the full history is kept and any change can be undone.

## How it works

| Folder | What's in it |
|---|---|
| `entries/` | One Markdown file per entry. Front matter holds the fields; the text below it is the article |
| `topics/` | Top tags: the branches of the map |
| `media/` | Uploaded images |
| `site/` | The website builder (`build.mjs`), styles, map, search and editing scripts |
| `worker/` | The save service that writes changes from the website to this repository |
| `editors.json` | Editors' names and the fingerprints of their sign-in keys (never the keys themselves) |
| `.pages.yml` | Defines the editing screens in Pages CMS |

On every change to `main`, a GitHub Action runs `npm run build` and publishes `_site/` to GitHub Pages. There are no paid services and nothing to renew.

### Entry files

Each entry is a short block of settings followed by the text. The first paragraph of the text is the summary shown on the map. See [`entries/README.md`](entries/README.md) for the full format and an example.

### Building locally

```bash
npm install
npm run build
```

Then open `_site/index.html` through a local web server, e.g. `npx serve _site`.

## In-map editing: switching it on

The form needs the save service in `worker/`, a free Cloudflare Worker. Until it's set up, the form points people to Pages CMS instead.

1. **Create a GitHub token** for the service: GitHub → Settings → Developer settings → Fine-grained tokens. Owner: `rewiring-nz`. Repository: `knowledge-base` only. Permissions: **Contents** and **Pull requests**, read and write. Set the longest expiry allowed, and note the date.
2. **Deploy the service** (needs a free Cloudflare account):
   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler deploy
   ```
   The deploy prints the service address, e.g. `https://knowledge-base-save.<account>.workers.dev`.
3. **Connect the website:** put that address in `site/config.json` as `"api"`, then commit and push.
4. **Make the first admin:** run `node scripts/new-editor.mjs "Your name" --admin`, commit and push `editors.json`, then open the printed link. More editors can then be invited from **Editor tools** on the map.
5. **Optional spam protection:** create a Cloudflare Turnstile widget for `rewiring-nz.github.io`, put its site key in `site/config.json` as `"turnstileSiteKey"`, and run `npx wrangler secret put TURNSTILE_SECRET` with its secret key.

If the token expires, editing stops working (reading is unaffected). Make a new token and run `npx wrangler secret put GITHUB_TOKEN` again.

## Looking after it long term

- Keep at least two admins on this repository and on the Cloudflare account, from different organisations.
- Note the GitHub token's expiry date somewhere shared.
- The repository can be transferred to another GitHub organisation with its full history.
- All content is plain text, readable without any special software.
