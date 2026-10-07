// GuyHadas Visibility OS - shared deterministic text-similarity helpers
// (Jaccard token-overlap). Used by functions/searchUniverse.js (grouping
// discovered queries into Search Topics) and functions/businessUnderstanding.js
// (deduping proposed/owner-entered business services against each other).
//
// Kept dependency-free and language-agnostic on purpose - works the same
// for Hebrew and English - and deliberately NOT an LLM call: per the
// roadmap's own instruction to stay deterministic wherever possible, the
// *grouping* of near-duplicate text stays mechanical; only *understanding
// what a business sells* (functions/businessUnderstanding.js) uses AI.

// NOTE on a known limitation: Hebrew attaches single-letter prefixes
// directly onto the next word with no space (ו-and, ה-the, ב-in, כ-as/like,
// ל-to/for, מ-from, ש-that/which - "למגורים" is "ל" + "מגורים"), so
// "אדריכלות מגורים" and "אדריכלות למגורים" - the same concept - only share
// 1 of their 3 distinct tokens here (0.33 Jaccard) instead of matching as
// near-identical. An earlier version of this file tried stripping a leading
// prefix letter to fix that, but the same letters are also real word-
// initial letters (e.g. the "מ" in "מגורים" itself looks exactly like the
// מ-from prefix), so a dictionary-free stripper strips real words too -
// verified by testing it against "מגורים" itself, which is worse than not
// stripping at all. Fixing this properly needs an actual Hebrew
// lemmatizer/word list, which is out of scope here (see the Milestone 3.1
// deliverable doc). Plural/singular and verb-form variants (e.g. שיפוצים
// vs שיפוץ) have the same kind of gap. This is exactly why every merge
// decision this file enables is owner-reviewable, never silent.
function tokenize(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[.,!?"'()[\]{}:;]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0)
  );
}

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

module.exports = { tokenize, jaccard };
