const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../core.js");
const dir = path.join(__dirname, "..", "content");
const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

const index = read("index.json");
const verbs = read("verbs.json");
const vocab = read("vocab.json");
const phrases = read("phrases.json");
const lessons = [...index.packs, ...index.classLessons].flatMap(f => { const j = read(f); return j.lessons || [j]; });

test("every vocab entry is unique and well formed", () => {
  const seen = new Set();
  for (const t of vocab.themes) for (const w of t.words) {
    assert.ok(!seen.has(w[0]), "duplicate word " + w[0]);
    seen.add(w[0]);
    assert.ok(["n", "a", "x", "num"].includes(w[2]), "bad type " + w);
    if (w[2] === "n") assert.match(w[0], /^(el|la|los|las) /, "noun without article " + w[0]);
    if (w[2] === "a") assert.equal(w[3].split("/").length, 4, "adjective forms " + w[0]);
  }
  for (const s of phrases.sets) for (const p of s.phrases) { assert.ok(!seen.has(p[0]), "duplicate " + p[0]); seen.add(p[0]); }
});

test("every lesson references real words and verbs, and has enough material", () => {
  const words = new Set(vocab.themes.flatMap(t => t.words.map(w => w[0])));
  const ids = new Set();
  for (const l of lessons) {
    assert.ok(!ids.has(l.id), "duplicate lesson id " + l.id); ids.add(l.id);
    for (const w of l.words) assert.ok(words.has(w), `${l.id}: unknown word ${w}`);
    for (const v of l.verbs) assert.ok(verbs[v], `${l.id}: unknown verb ${v}`);
    for (const e of [...l.rule, ...l.sentences]) {
      assert.ok(Array.isArray(e[1]) && e[1].length > 0, `${l.id}: exercise without answers: ${e[0]}`);
      assert.equal(C.grade(e[1][0], e[1], { sentence: true }), "ok", `${l.id}: first answer must grade ok: ${e[1][0]}`);
    }
    const items = l.rule.length + l.words.length + l.verbs.length + l.sentences.length;
    if (!l.class) assert.ok(items >= 35, `${l.id} only has ${items} items`);
  }
});

test("every verb is taught in some lesson and has six forms", () => {
  const taught = new Set(lessons.flatMap(l => l.verbs));
  for (const v of Object.keys(verbs)) {
    assert.ok(taught.has(v), "verb never taught: " + v);
    assert.equal(C.conj(v, verbs[v]).length, 6);
  }
});

test("computed plurals look right for every noun", () => {
  for (const t of vocab.themes) for (const w of t.words) {
    if (w[2] !== "n" || w[3] === "-") continue;
    const p = C.nounParts(w[0], w[3] || null).plural;
    assert.match(p, /^(los|las) /, w[0] + " -> " + p);
  }
});
