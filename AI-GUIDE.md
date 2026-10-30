# Guide for AI assistants

This guide tells an AI assistant (Claude, ChatGPT, Copilot or any other) how to add entries to the Electrification Knowledge Base so they arrive in the right structure. A person can paste this guide, or its web address, into their AI and ask it to turn notes, reports or conversations into entries.

- **Website:** https://rewiring-nz.github.io/knowledge-base/
- **This guide on the web:** https://rewiring-nz.github.io/knowledge-base/ai-guide/
- **Existing entries (JSON):** https://rewiring-nz.github.io/knowledge-base/api/entries.json
- **Top tags in use (JSON):** https://rewiring-nz.github.io/knowledge-base/api/topics.json
- **Save service description (OpenAPI):** https://rewiring-nz.github.io/knowledge-base/openapi.yaml

## What the knowledge base is

A public, plain-English record of what people have learnt about electrifying homes and vehicles. Readers are households and non-specialists. Each entry covers one thing.

## The structure of an entry

| Field | Required | Rules |
|---|---|---|
| `title` | Yes | A short, plain-English headline, under 100 characters. Name the thing, not the document it came from. |
| `type` | Yes | Exactly one of `Explainer` (background on a topic), `Learning` (something found out, ideally with evidence), `Issue` (a problem people hit). |
| `top_tag` | Yes | The branch of the map it sits under. **Use an existing top tag from `topics.json` whenever one fits.** Only propose a new one for a genuinely new area. |
| `status` | Issues only | `Open` or `Resolved`. Leave it out for explainers and learnings. |
| `body` | Recommended | Markdown text. **The first paragraph is the summary** shown on the map and in search: one to three sentences that stand on their own. Detail goes below it. |
| `tags` | Optional | 2 to 6 short keywords people would search for, e.g. `V2G`, `export limit`. Reuse tags already in `entries.json` where possible. |
| `related` | Optional | Exact titles of existing entries worth reading alongside this one. Only titles that appear in `entries.json`. |
| `contributors` | Optional | Names of the people the knowledge came from, if they agreed to be named. |

## Writing rules

1. **One idea per entry.** If a source covers five problems, make five entries.
2. **Check for duplicates first.** Search `entries.json` for the same subject. If an entry already exists, suggest changes to it instead of adding a new one.
3. **Plain English.** Write for a householder. Explain acronyms the first time (Vehicle-to-Grid (V2G)). Short sentences.
4. **Lead with the point.** The first paragraph says what the reader needs to know, not background.
5. **Be specific and honest.** Include numbers, models, dates and places where the source gives them. Never invent facts, figures or quotes. If something is uncertain, say so.
6. **No private details.** Never include household names, addresses, phone numbers, emails or anything that identifies a member of the public.
7. **Keep the source's meaning.** Summarise; don't add opinions that aren't in the source.

## Three ways to add entries

### 1. Send them to the save service (best when your AI can make web requests)

Send each entry as a `POST` request to `{save service address}/api/entries` with a JSON body. The save service address is listed in `openapi.yaml`.

```json
{
  "name": "Your name, as the person sending it",
  "entry": {
    "title": "Charger fan noise at night",
    "type": "Issue",
    "status": "Open",
    "top_tag": "Two Way Charging (V2G, V2L)",
    "body": "Some bidirectional chargers have cooling fans that are noticeable at night when the garage is next to a bedroom.\n\n## What helped\n\n- Scheduling exports for the evening peak rather than overnight\n- Choosing a mounting spot away from shared walls",
    "tags": ["noise", "charger"],
    "related": ["Vehicle-To-Grid Explainer"],
    "contributors": ["Sam"]
  }
}
```

- Without a sign-in key, entries arrive as **suggestions** that an editor approves. This is the normal route for AI-drafted entries.
- An editor can add the header `Authorization: Bearer <their personal key>` to publish directly. Only do this when the person has checked the entries.
- To change an existing entry, first `GET /api/entry?id=<id>` (ids are in `entries.json`), then `POST /api/entries` with `"id"`, the `"sha"` it returned, and the full updated `"entry"`.
- A successful reply is `{"mode": "suggested"}` or `{"mode": "published"}`. An error reply has an `"error"` message that explains what to fix.

### 2. Give the person ready-to-paste entries

If your AI can't make web requests, present each entry with its fields clearly labelled (Title, Type of entry, Top tag, Status, Text, Tags, Related entries). The person then clicks **Add an entry** on the map and pastes each field into the form.

### 3. Add files to the GitHub repository

For AIs with GitHub access: add one Markdown file per entry to the `entries/` folder of https://github.com/rewiring-nz/knowledge-base, named after the title in lowercase with dashes (`charger-fan-noise-at-night.md`). Open a pull request so an editor can review it. The file format:

```markdown
---
title: Charger fan noise at night
type: Issue
top_tag: Two Way Charging (V2G, V2L)
status: Open
tags: [noise, charger]
related: [Vehicle-To-Grid Explainer]
contributors: [Sam]
---

Some bidirectional chargers have cooling fans that are noticeable at night when the garage is next to a bedroom.

## What helped

- Scheduling exports for the evening peak rather than overnight
```

## A prompt your team can use

> Read the guide at https://rewiring-nz.github.io/knowledge-base/ai-guide/ and the existing entries at https://rewiring-nz.github.io/knowledge-base/api/entries.json. Turn the notes below into knowledge base entries that follow the guide: one idea per entry, existing top tags where they fit, no duplicates, no private details. Show me the entries to check before sending them as suggestions.
>
> [paste notes here]
