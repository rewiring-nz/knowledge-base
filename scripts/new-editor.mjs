// Creates a personal sign-in link for an editor and records them in editors.json.
// Usage: node scripts/new-editor.mjs "Name" [--admin]
// Then commit and push editors.json. Admins can invite further editors from the map.
import fs from "node:fs";
import crypto from "node:crypto";

const name = process.argv[2];
if (!name) { console.error('Usage: node scripts/new-editor.mjs "Name" [--admin]'); process.exit(1); }
const admin = process.argv.includes("--admin");
const config = JSON.parse(fs.readFileSync("site/config.json", "utf8"));
const list = fs.existsSync("editors.json") ? JSON.parse(fs.readFileSync("editors.json", "utf8")) : [];
const token = crypto.randomBytes(32).toString("base64url");
list.push({ name, hash: crypto.createHash("sha256").update(token).digest("hex"), admin, added: new Date().toISOString().slice(0, 10), addedBy: "setup script" });
fs.writeFileSync("editors.json", JSON.stringify(list, null, 2) + "\n");
console.log(`Added ${name}${admin ? " as an admin" : ""}. Their personal sign-in link (keep it private; it only works once editors.json is pushed):\n\n${config.siteUrl}?key=${token}\n`);
