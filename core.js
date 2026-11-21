// Pure logic shared by the app and the tests: grading, conjugation, plurals, scheduling.
(function (g) {
  const PRONOUNS = ["yo", "tú", "él", "ella", "usted", "nosotros", "nosotras", "vosotros", "vosotras", "ellos", "ellas", "ustedes"];
  const PERSONS = ["yo", "tú", "él / ella / usted", "nosotros/as", "vosotros/as", "ellos / ellas / ustedes"];
  const ENDINGS = {
    ar: ["o", "as", "a", "amos", "áis", "an"],
    er: ["o", "es", "e", "emos", "éis", "en"],
    ir: ["o", "es", "e", "imos", "ís", "en"]
  };

  const norm = s => String(s).toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[¿¡?!.,;:"«»()…]/g, " ")
    .replace(/\s+/g, " ").trim();
  const bare = s => norm(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Drop a leading subject pronoun, since Spanish usually omits it.
  const dropPronoun = s => {
    const w = s.split(" ");
    return w.length > 1 && PRONOUNS.includes(w[0]) ? w.slice(1).join(" ") : s;
  };

  // "ok" exact, "warn" right apart from accents or ñ, "bad" otherwise.
  function grade(input, answers, opts) {
    opts = opts || {};
    const n = norm(input);
    if (!n) return "bad";
    const variants = s => {
      const v = [norm(s)];
      if (opts.sentence) v.push(dropPronoun(norm(s)));
      return v;
    };
    const inV = variants(input);
    for (const a of answers) {
      const aV = variants(a);
      if (inV.some(x => aV.includes(x))) return "ok";
    }
    const strip = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const a of answers) {
      const aV = variants(a).map(strip);
      if (inV.map(strip).some(x => aV.includes(x))) return "warn";
    }
    return "bad";
  }

  function conj(inf, verb) {
    if (verb && verb.pres) return verb.pres.slice();
    const end = inf.slice(-2);
    if (!ENDINGS[end]) throw new Error("Not a verb: " + inf);
    return ENDINGS[end].map(e => inf.slice(0, -2) + e);
  }

  const ACCENT_OFF = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u" };
  // Plural of a bare noun or adjective (no article).
  function pluralWord(w) {
    if (w.includes(" ")) {
      // Plural of the head word only: "fin de semana" -> "fines de semana".
      const parts = w.split(" ");
      return [pluralWord(parts[0])].concat(parts.slice(1)).join(" ");
    }
    if (/[aeiouáéó]$/.test(w)) return w + "s";
    if (/[íú]$/.test(w)) return w + "s";
    if (/z$/.test(w)) return w.slice(0, -1) + "ces";
    // Drop a written accent on the last syllable: balcón -> balcones, autobús -> autobuses.
    const m = w.match(/^(.*)([áéíóú])([^aeiouáéíóú]*)$/);
    if (m && /[ns]$/.test(w)) return m[1] + ACCENT_OFF[m[2]] + m[3] + "es";
    return w + "es";
  }

  // A noun entry: "el piso" -> { art, base, plural: "los pisos" }.
  function nounParts(es, override) {
    const [art, ...rest] = es.split(" ");
    const base = rest.join(" ");
    const pArt = art === "el" ? "los" : "las";
    return { art, base, plural: override || (pArt + " " + pluralWord(base)) };
  }

  // Adjective forms from "m/f/mpl/fpl" or the masculine alone.
  function adjForms(es, forms) {
    if (forms) return forms.split("/");
    const f = /o$/.test(es) ? es.slice(0, -1) + "a" : es;
    return [es, f, pluralWord(es), pluralWord(f)];
  }

  function dayNumber(date) {
    const d = date || new Date();
    return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
  }

  // Simple spaced repetition. res: ok | warn | bad.
  function schedule(card, res, today) {
    const c = Object.assign({ ivl: 0, ease: 2.5, reps: 0, lapses: 0 }, card || {});
    if (res === "bad") {
      c.lapses++; c.reps = 0; c.ivl = 1; c.ease = Math.max(1.3, c.ease - 0.2);
    } else {
      c.reps++;
      let next = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(c.ivl * c.ease);
      if (res === "warn") next = Math.max(1, Math.round(next * 0.7));
      else c.ease = Math.min(3, c.ease + 0.05);
      c.ivl = next;
    }
    c.due = today + c.ivl;
    return c;
  }

  const Core = { PERSONS, PRONOUNS, norm, bare, grade, conj, pluralWord, nounParts, adjForms, dayNumber, schedule };
  g.Core = Core;
  if (typeof module !== "undefined") module.exports = Core;
})(typeof window !== "undefined" ? window : globalThis);
