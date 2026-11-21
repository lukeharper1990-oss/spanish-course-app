const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("grading: exact, accent warning, wrong", () => {
  assert.equal(C.grade("habláis", ["habláis"]), "ok");
  assert.equal(C.grade("hablais", ["habláis"]), "warn");
  assert.equal(C.grade("hablamos", ["habláis"]), "bad");
  assert.equal(C.grade("", ["habláis"]), "bad");
  assert.equal(C.grade("Nino", ["niño"]), "warn");
});

test("grading ignores case, punctuation and spacing", () => {
  assert.equal(C.grade("  ¿Cuánto   cuesta? ", ["¿Cuánto cuesta?"]), "ok");
  assert.equal(C.grade("cuanto cuesta", ["¿Cuánto cuesta?"]), "warn");
  assert.equal(C.grade("Vivo en Barcelona, pero trabajo en casa.", ["vivo en barcelona pero trabajo en casa"]), "ok");
});

test("sentence grading accepts a dropped or added subject pronoun", () => {
  assert.equal(C.grade("nosotros comemos pan", ["comemos pan"], { sentence: true }), "ok");
  assert.equal(C.grade("comemos pan", ["nosotros comemos pan"], { sentence: true }), "ok");
  assert.equal(C.grade("nosotros comemos pan", ["comemos pan"]), "bad");
  // A single-word pronoun answer must not be emptied out.
  assert.equal(C.grade("ella", ["yo"], { sentence: true }), "bad");
});

test("regular present tense", () => {
  assert.deepEqual(C.conj("hablar"), ["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"]);
  assert.deepEqual(C.conj("comer"), ["como", "comes", "come", "comemos", "coméis", "comen"]);
  assert.deepEqual(C.conj("vivir"), ["vivo", "vives", "vive", "vivimos", "vivís", "viven"]);
  assert.deepEqual(C.conj("leer"), ["leo", "lees", "lee", "leemos", "leéis", "leen"]);
});

test("irregular verbs use their stored forms", () => {
  const tener = { pres: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"] };
  assert.equal(C.conj("tener", tener)[0], "tengo");
});

test("plurals", () => {
  assert.equal(C.pluralWord("casa"), "casas");
  assert.equal(C.pluralWord("café"), "cafés");
  assert.equal(C.pluralWord("pan"), "panes");
  assert.equal(C.pluralWord("balcón"), "balcones");
  assert.equal(C.pluralWord("habitación"), "habitaciones");
  assert.equal(C.pluralWord("autobús"), "autobuses");
  assert.equal(C.pluralWord("arroz"), "arroces");
  assert.equal(C.pluralWord("fin de semana"), "fines de semana");
  assert.equal(C.nounParts("el piso").plural, "los pisos");
  assert.equal(C.nounParts("la llave").plural, "las llaves");
  assert.equal(C.nounParts("el agua", "las aguas").plural, "las aguas");
});

test("adjective forms", () => {
  assert.deepEqual(C.adjForms("nuevo"), ["nuevo", "nueva", "nuevos", "nuevas"]);
  assert.deepEqual(C.adjForms("grande"), ["grande", "grande", "grandes", "grandes"]);
  assert.deepEqual(C.adjForms("azul"), ["azul", "azul", "azules", "azules"]);
  assert.deepEqual(C.adjForms("inglés", "inglés/inglesa/ingleses/inglesas"), ["inglés", "inglesa", "ingleses", "inglesas"]);
});

test("scheduling", () => {
  let c = C.schedule(null, "ok", 100);
  assert.equal(c.due, 101);
  c = C.schedule(c, "ok", 101);
  assert.equal(c.due, 104);
  const w = C.schedule(c, "warn", 104);
  const o = C.schedule(c, "ok", 104);
  assert.ok(w.ivl < o.ivl);
  const b = C.schedule(o, "bad", 110);
  assert.equal(b.due, 111);
  assert.equal(b.lapses, 1);
});
