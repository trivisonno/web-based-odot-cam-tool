/* Generates build/page.html — index.html with the document skeleton stripped,
   which is the shape the Artifact publisher expects. Run: node build.mjs */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const src = readFileSync("index.html", "utf8");
const head = src.slice(src.indexOf("<head>") + 6, src.indexOf("</head>"));
const body = src.slice(src.indexOf("<body>") + 6, src.indexOf("</body>"));

const keep = head
  .trim()
  .split("\n")
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith("<meta charset") && !t.startsWith('<meta name="viewport"');
  })
  .join("\n")
  .trim();

mkdirSync("build", { recursive: true });
writeFileSync(
  "build/page.html",
  "<!-- Generated from index.html; edit that file, not this one. -->\n" + keep + "\n" + body.trim() + "\n"
);
console.log("build/page.html written");
