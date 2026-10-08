// M3.2 acceptance #17: no provider call on page render/load.
// Every function exported by src/lib/functions.ts reaches a Cloud Function
// (and possibly a paid provider). None may be invoked from a React effect
// (which runs on render/mount) in the workspace pages - only from explicit
// button handlers. Static check over the source.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const fnSrc = readFileSync(join(root, "lib/functions.ts"), "utf8");
const callables = [...fnSrc.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]).filter((n) => n !== "governedDetails");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

// Extract the full argument text of every useEffect(...) call.
function effectBodies(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf("useEffect(");
  while (i !== -1) {
    let depth = 0;
    let j = i + "useEffect".length;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf("useEffect(", j);
  }
  return out;
}

const violations: string[] = [];
let checked = 0;
for (const f of files(join(root, "pages"))) {
  for (const body of effectBodies(readFileSync(f, "utf8"))) {
    checked++;
    for (const name of callables) if (new RegExp(`\\b${name}\\(`).test(body)) violations.push(`${f}: ${name} called inside useEffect`);
  }
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log(`No Cloud Function / provider call inside any of ${checked} page effects (${callables.length} callables checked).`);
