# Electrification Knowledge Base

A public, plain-English knowledge base about electrification, with an interactive mind map, search and one page per entry.

**Website:** https://rewiring-nz.github.io/knowledge-base/

## Adding or editing entries

Editors use [Pages CMS](https://app.pagescms.org), a free, open-source editing screen for this repository. See the website's [How to contribute](https://rewiring-nz.github.io/knowledge-base/contribute/) page.

- **People with a GitHub account** sign in with it.
- **People without one** are invited by email from Pages CMS (Settings → Collaborators).

Every save is a commit here, so the full history is kept and any change can be undone.

## How it works

| Folder | What's in it |
|---|---|
| `entries/` | One Markdown file per entry. Front matter holds the fields; the text below it is the article |
| `topics/` | Top tags: the branches of the map |
| `media/` | Uploaded images |
| `site/` | The website builder (`build.mjs`), styles and map script |
| `.pages.yml` | Defines the editing screens in Pages CMS |

On every change to `main`, a GitHub Action runs `npm run build` and publishes `_site/` to GitHub Pages. There are no paid services and nothing to renew.

### Entry fields

| Field | Notes |
|---|---|
| `title` | Required |
| `type` | `explainer`, `learning` or `issue` |
| `status` | `open` or `resolved`, issues only |
| `top_tag` | Name of a top tag in `topics/` |
| `description` | Short summary, shown on the map |
| `tags` | List of keywords |
| `related` | List of other entry paths, e.g. `entries/vehicle-to-load-explainer.md`. Links show on both entries |
| `contributors` | List of names |
| `image` | Uploaded image path |

### Building locally

```bash
npm install
npm run build
```

Then open `_site/index.html` through a local web server, e.g. `npx serve _site`.

## Looking after it long term

- Keep at least two admins on this repository from different organisations.
- The repository can be transferred to another GitHub organisation with its full history.
- All content is plain text, readable without any special software.
