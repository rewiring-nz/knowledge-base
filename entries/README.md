# Entries

Each file in this folder is one entry in the knowledge base. The easiest way to add or edit one is the **Add an entry** or **Edit this entry** button on the website. You can also edit these files directly here on GitHub.

## What an entry file looks like

```markdown
---
title: Vehicle-To-Grid Explainer
type: Explainer
top_tag: "Two Way Charging (V2G, V2L)"
tags: [V2G, EV]
related: [Vehicle-To-Load Explainer]
contributors: [Josh]
---

The first paragraph is the summary. It's shown on the map and in search results.

Write as much more as you like below it. Headings, lists, links and images all work.
```

The part between the `---` lines is the settings. Everything below it is the entry's text.

| Setting | What to put | Required |
|---|---|---|
| `title` | A short, plain-English headline | Yes |
| `type` | `Explainer`, `Learning` or `Issue` | Yes |
| `top_tag` | The branch on the map. Must match a name in the `topics` folder | Yes |
| `status` | `Open` or `Resolved`. Issues only | No |
| `tags` | Keywords in square brackets, separated by commas | No |
| `related` | Titles of other entries, in square brackets | No |
| `contributors` | Names, in square brackets | No |
| `image` | Path of an uploaded image, e.g. `/media/charger.jpg` | No |

Tips:
- Related links show on both entries, so you only need to add them on one side.
- If you rename an entry, update its title anywhere it's listed under `related`.
- Name new files after the title, in lowercase with dashes: `my-new-entry.md`.
