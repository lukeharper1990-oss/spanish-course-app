/* Paso a Paso: app shell. Content lives in /content, pure logic in core.js. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => Core.dayNumber();
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const PERSONS = Core.PERSONS;
const FORM_LABELS = ["masculine singular", "feminine singular", "masculine plural", "feminine plural"];
const DECK_ORDER = ["home", "food", "basics", "people", "numbers", "ph-greetings", "time", "city", "work", "ph-class", "describing", "ph-bar", "health", "admin", "ph-admin", "freetime", "ph-directions", "weather", "shopping", "ph-shopping", "ph-health", "ph-work"];

/* ---------------- Content ---------------- */
const C = { verbs: {}, items: {}, decks: [], lessons: [], classLessons: [] };

function addWord(w, deckId) {
  const [es, en, type, extra, note] = w;
  const item = { id: "w:" + es, es, en, type, deck: deckId, note: note || null };
  if (type === "n") {
    const p = extra === "-" ? null : Core.nounParts(es, extra || null).plural;
    item.plural = p;
  }
  if (type === "a") item.forms = Core.adjForms(es, extra);
  C.items[item.id] = item;
  return item.id;
}

async function loadContent() {
  const get = f => fetch("content/" + f, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(f); return r.json(); });
  const index = await get("index.json");
  const [verbs, vocab, phrases, packs, classes] = await Promise.all([
    get("verbs.json"), get("vocab.json"), get("phrases.json"),
    Promise.all(index.packs.map(get)), Promise.all(index.classLessons.map(get))
  ]);
  C.verbs = verbs;
  const decks = {};
  for (const t of vocab.themes) decks[t.id] = { id: t.id, title: t.title, level: t.level, kind: "words", ids: t.words.map(w => addWord(w, t.id)) };
  for (const s of phrases.sets) decks[s.id] = { id: s.id, title: s.title.replace(/^Phrases: /, ""), level: s.level, kind: "phrases", ids: s.phrases.map(p => addWord([p[0], p[1], "phrase"], s.id)) };
  C.decks = DECK_ORDER.filter(id => decks[id]).map(id => decks[id]).concat(Object.values(decks).filter(d => !DECK_ORDER.includes(d.id)));
  C.lessons = packs.flatMap(p => p.lessons);
  C.classLessons = classes.map(l => {
    // A class lesson can bring its own new words: [es, en, type, extra, note].
    if (l.newWords) {
      const ids = l.newWords.map(w => addWord(w, "class"));
      l.words = (l.words || []).concat(ids.map(id => id.slice(2)));
    }
    l.class = true;
    return l;
  }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const classIds = Object.values(C.items).filter(i => i.deck === "class").map(i => i.id);
  if (classIds.length) C.decks.unshift({ id: "class", title: "From class", level: "A1", kind: "words", ids: classIds });
}
const allLessons = () => C.classLessons.concat(C.lessons);
const lessonById = id => allLessons().find(l => l.id === id);
const verbForms = inf => Core.conj(inf, C.verbs[inf]);

/* ---------------- State ---------------- */
const KEY = "pasoapaso.v2";
const blank = () => ({ v: 2, done: {}, cards: {}, custom: [], days: {}, newDays: {}, settings: { quota: 10, focus: null, speak: true }, updated: 0 });
let S = blank();
try { const raw = localStorage.getItem(KEY); if (raw) S = merge(JSON.parse(raw)); } catch (e) {}
function merge(x) { const b = blank(); const s = Object.assign(b, x); s.settings = Object.assign(blank().settings, x.settings || {}); return s; }
function save() { S.updated = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Couldn't save progress on this phone."); } }

/* ---------------- Audio and speech ---------------- */
let voices = [];
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch (e) {} };
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/<[^>]+>/g, ""));
  u.lang = "es-ES"; u.rate = 0.9;
  const v = voices.find(v => v.lang === "es-ES") || voices.find(v => /^es/.test(v.lang));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canSpeak = () => !!SR && S.settings.speak !== false;
function listen(btn, onText) {
  if (!SR) { toast("Speech recognition isn't available in this browser. Try Chrome."); return; }
  const r = new SR(); r.lang = "es-ES"; r.interimResults = false; r.maxAlternatives = 3;
  btn && btn.classList.add("listening");
  r.onresult = e => { const alts = [...e.results[0]].map(a => a.transcript); onText(alts); };
  r.onerror = e => toast(e.error === "not-allowed" ? "Allow microphone access for this site in Chrome's settings." : e.error === "no-speech" ? "Didn't hear anything. Tap and try again." : "Didn't catch that. Try again.");
  r.onend = () => btn && btn.classList.remove("listening");
  try { r.start(); } catch (e) { btn && btn.classList.remove("listening"); }
}

/* ---------------- Small UI helpers ---------------- */
const ICON = {
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  lessons: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/></svg>',
  words: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="13" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>'
};
const sayBtn = (text, label) => `<button class="icon-btn" data-say="${esc(text)}" aria-label="Listen: ${esc(label || text)}">${ICON.speaker}</button>`;
document.addEventListener("click", e => { const b = e.target.closest("[data-say]"); if (b) speak(b.dataset.say); });
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2800); }
const KEYS = ["á", "é", "í", "ó", "ú", "ñ", "ü", "¿", "¡"];
const keysHtml = () => `<div class="keys" aria-label="Accent keys">${KEYS.map(k => `<button type="button" class="key" data-key="${k}" tabindex="-1">${k}</button>`).join("")}</div>`;
function wireKeys(getTarget) {
  $$("[data-key]").forEach(b => {
    b.addEventListener("mousedown", e => e.preventDefault());
    b.addEventListener("click", () => {
      const t = getTarget(); if (!t || t.readOnly) return;
      const s = t.selectionStart ?? t.value.length, en = t.selectionEnd ?? t.value.length;
      t.value = t.value.slice(0, s) + b.dataset.key + t.value.slice(en); t.focus(); t.setSelectionRange(s + 1, s + 1);
    });
  });
}
const nounLabel = it => it.es;

/* ---------------- Cards ---------------- */
function cardInfo(id) {
  const i = id.indexOf(":"), t = id.slice(0, i), rest = id.slice(i + 1);
  if (t === "w") { const it = C.items[id]; return it ? { kind: "word", item: it } : null; }
  if (t === "m") { const v = C.verbs[rest]; return v ? { kind: "meaning", inf: rest, verb: v } : null; }
  if (t === "v") { const v = C.verbs[rest]; return v ? { kind: "verb", inf: rest, verb: v, forms: verbForms(rest) } : null; }
  if (t === "x" || t === "s") {
    const [lid, n] = rest.split(":"); const l = lessonById(lid); if (!l) return null;
    const e = (t === "x" ? l.rule : l.sentences)[+n]; if (!e) return null;
    return { kind: "text", prompt: e[0], answers: e[1], note: e[2], hint: l.title, sentence: t === "s", html: true };
  }
  if (t === "c") { const c = S.custom.find(c => c.id === rest); return c ? { kind: "text", prompt: c.en, answers: [c.es], hint: "from class", say: c.es } : null; }
  return null;
}
function grade(id, res, cells) {
  const c = Core.schedule(S.cards[id], res, today());
  if (cells) { c.cells = (S.cards[id] && S.cards[id].cells) || [0, 0, 0, 0, 0, 0]; cells.forEach((r, k) => { if (r === "bad") c.cells[k]++; }); }
  S.cards[id] = c;
  S.days[today()] = (S.days[today()] || 0) + 1;
}
const dueCards = () => Object.keys(S.cards).filter(id => S.cards[id].due <= today() && cardInfo(id));
function streak() { let d = today(), n = 0; if (!S.days[d]) d--; while (S.days[d]) { n++; d--; } return n; }
const known = id => !!S.cards[id];
const newToday = () => S.newDays[today()] || 0;
function nextNewWords(n, deckId) {
  const decks = deckId ? C.decks.filter(d => d.id === deckId) : (S.settings.focus ? [C.decks.find(d => d.id === S.settings.focus)].concat(C.decks) : C.decks);
  const out = [];
  for (const d of decks) { if (!d) continue; for (const id of d.ids) { if (!known(id) && !out.includes(id)) out.push(id); if (out.length >= n) return out; } }
  return out;
}
const nextLesson = () => allLessons().find(l => !S.done[l.id]);
function lessonQueue(l) {
  const q = l.rule.map((_, i) => `x:${l.id}:${i}`);
  const words = (l.words || []).map(w => "w:" + w).filter(id => C.items[id]);
  const newWords = words.filter(id => !known(id));
  if (newWords.length) q.push({ intro: "words", ids: newWords, title: "New words for this lesson" }, ...newWords);
  const verbs = (l.verbs || []).filter(v => C.verbs[v]);
  if (verbs.length) {
    q.push({ intro: "verbs", ids: verbs });
    verbs.forEach(v => { if (!known("m:" + v)) q.push("m:" + v); q.push("v:" + v); });
  }
  if (l.sentences && l.sentences.length) q.push({ intro: "note", html: `<h2>Build sentences</h2><p class="muted">Now put it together. Translate each sentence into Spanish. Leaving out yo, tú and so on is fine.</p>` }, ...l.sentences.map((_, i) => `s:${l.id}:${i}`));
  return q;
}

/* ---------------- Navigation ---------------- */
let current = "today";
const TABS = [["today", "Today"], ["lessons", "Lessons"], ["words", "Words"], ["library", "Library"], ["me", "Me"]];
function renderTabs() { $("#tabs").innerHTML = TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" ${current === k ? 'aria-current="page"' : ""}>${ICON[k]}<span>${l}</span></button>`).join(""); }
$("#tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) route(b.dataset.tab); });
function route(name) {
  current = name; renderTabs(); window.scrollTo(0, 0); $("#view").onclick = null;
  ({ today: renderToday, lessons: renderLessons, words: renderWords, library: renderLibrary, me: renderMe })[name]();
}

/* ---------------- Today ---------------- */
const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="9" fill="var(--accent)"/><g fill="var(--surface)"><circle cx="20" cy="20" r="4"/><circle cx="20" cy="8" r="3"/><circle cx="20" cy="32" r="3"/><circle cx="8" cy="20" r="3"/><circle cx="32" cy="20" r="3"/></g></svg>`;
function renderToday() {
  const due = dueCards(), next = nextLesson(), q = S.settings.quota, nt = newToday();
  const words = Object.keys(S.cards).filter(id => id.startsWith("w:")).length;
  const totalWords = Object.keys(C.items).length;
  $("#view").innerHTML = `
  <header class="logo">${LOGO}<div><h1>Paso a Paso</h1><p class="muted small">Spanish, one step a day</p></div></header>
  <section class="panel">
    <p class="eyebrow">1 · Reviews</p>
    <h2>${due.length ? `${due.length} card${due.length > 1 ? "s" : ""} due` : Object.keys(S.cards).length ? "All caught up" : "Nothing to review yet"}</h2>
    <p class="muted small">${due.length ? "Words, verb tables and exercises, timed so you see them just before you'd forget." : "What you learn comes back here for review."}</p>
    ${due.length ? `<button class="btn block" id="review">Start review${due.length > 60 ? " (60 at a time)" : ""}</button>` : ""}
  </section>
  <section class="panel">
    <p class="eyebrow">2 · New words</p>
    <div class="spread"><h2>${nt >= q ? "Today's words done" : `${q - nt} new word${q - nt > 1 ? "s" : ""} to learn`}</h2><span class="muted small">${nt} / ${q}</span></div>
    <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, Math.round(nt / q * 100))}%"></span></div>
    <p class="muted small">From: ${esc((C.decks.find(d => d.id === S.settings.focus) || C.decks.find(d => d.ids.some(id => !known(id))) || { title: "your word lists" }).title)} · ${words} of ${totalWords} words learned</p>
    <button class="btn block ${due.length ? "secondary" : ""}" id="neww">${nt >= q ? "Learn 5 more" : "Learn new words"}</button>
  </section>
  ${next ? `<section class="panel">
    <p class="eyebrow">3 · ${next.class ? "From class" : "Next lesson"}</p>
    <h2>${esc(next.title)}</h2>
    <p class="muted small">${esc(next.summary || "")} About ${lessonMinutes(next)} minutes.</p>
    <button class="btn block secondary" id="learn">Open lesson</button>
  </section>` : `<section class="panel"><p class="eyebrow">3 · Lessons</p><h2>All lessons done</h2><p class="muted small">Ask Claude to add a lesson on whatever you covered in class.</p></section>`}
  <div class="stat-grid">
    <div class="stat"><b>${streak()}</b><span class="muted small">day streak</span></div>
    <div class="stat"><b>${S.days[today()] || 0}</b><span class="muted small">answers today</span></div>
  </div>`;
  if ($("#review")) $("#review").onclick = () => runSession(shuffle(due).slice(0, 60), { title: "Review" });
  $("#neww").onclick = () => startNewWords(nt >= q ? 5 : q - nt);
  if ($("#learn")) $("#learn").onclick = () => openLesson(next);
}
function startNewWords(n, deckId) {
  const ids = nextNewWords(n, deckId);
  if (!ids.length) { toast("You've learned every word in this list."); return; }
  runSession([{ intro: "words", ids, title: "New words" }, ...ids], { title: "New words", learning: true, onFinish: () => { S.newDays[today()] = newToday() + ids.length; save(); } });
}
const lessonMinutes = l => Math.max(5, Math.round(((l.rule || []).length * 20 + (l.words || []).length * 20 + (l.verbs || []).length * 50 + (l.sentences || []).length * 35 + 120) / 60));

/* ---------------- Lessons ---------------- */
function renderLessons() {
  const item = l => `<li><button class="item-btn" data-lesson="${esc(l.id)}"><span class="badge ${l.class ? "warm" : ""}">${l.class ? "Class" : l.level}</span>
    <span><strong>${esc(l.title)}</strong><br><span class="muted small">${esc(l.summary || "")}</span></span>
    <span class="state ${S.done[l.id] ? "done" : ""}">${S.done[l.id] ? "Done" : lessonMinutes(l) + " min"}</span></button></li>`;
  $("#view").innerHTML = `<h1>Lessons</h1>
    ${C.classLessons.length ? `<p class="eyebrow">From class</p><ul class="list-plain">${C.classLessons.map(item).join("")}</ul>` : ""}
    <p class="eyebrow">A1 course</p><p class="muted small">In order, but open any lesson whenever you like.</p>
    <ul class="list-plain">${C.lessons.map(item).join("")}</ul>`;
  $("#view").onclick = e => { const b = e.target.closest("[data-lesson]"); if (b) openLesson(lessonById(b.dataset.lesson)); };
}
function openLesson(l) {
  $("#view").onclick = null; window.scrollTo(0, 0);
  const q = lessonQueue(l), n = q.filter(x => typeof x === "string").length;
  $("#view").innerHTML = `<p class="eyebrow">${l.class ? "From class" : "Lesson · " + l.level}${S.done[l.id] ? " · done" : ""}</p><h1>${esc(l.title)}</h1>
    <section class="panel rule-body">${l.body}</section>
    <section class="panel"><p class="small muted">This lesson: ${l.rule.length} rule exercises · ${(l.words || []).length} words · ${(l.verbs || []).length} verb tables · ${(l.sentences || []).length} sentences. About ${lessonMinutes(l)} minutes.</p>
    <button class="btn block" id="go">${S.done[l.id] ? "Do it again" : "Start lesson"} (${n})</button></section>
    <button class="btn ghost" id="back">Back</button>`;
  $("#go").onclick = () => runSession(q, { title: l.title, learning: true, onFinish: () => { S.done[l.id] = true; save(); } });
  $("#back").onclick = () => route(current);
}

/* ---------------- Words ---------------- */
function renderWords() {
  const q = S.settings.quota;
  $("#view").innerHTML = `<h1>Words</h1>
    <section class="panel"><div class="spread"><label for="quota"><strong>New words per day</strong></label>
      <select id="quota" style="width:auto">${[5, 10, 15, 20, 30].map(n => `<option ${n === q ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <p class="muted small">New words come from your focus list, then the next list in order. Pick a list below to change focus.</p></section>
    <ul class="list-plain">${C.decks.map(d => { const k = d.ids.filter(known).length; return `<li><button class="item-btn" data-deck="${d.id}">
      <span class="badge ${d.kind === "phrases" ? "warm" : ""}">${d.kind === "phrases" ? "Phrases" : d.level}</span>
      <span><strong>${esc(d.title)}</strong>${S.settings.focus === d.id ? ` <span class="known">· focus</span>` : ""}<div class="meter" style="margin-top:6px"><span style="width:${Math.round(k / d.ids.length * 100)}%"></span></div></span>
      <span class="state">${k} / ${d.ids.length}</span></button></li>`; }).join("")}</ul>`;
  $("#quota").onchange = e => { S.settings.quota = +e.target.value; save(); toast(`${S.settings.quota} new words a day`); };
  $("#view").onclick = e => { const b = e.target.closest("[data-deck]"); if (b) openDeck(b.dataset.deck); };
}
function wordLine(it) {
  const sub = it.type === "n" && it.plural ? ` · ${esc(it.plural)}` : it.type === "a" ? ` · ${esc(it.forms.join(", "))}` : "";
  return `<div class="word-card">${sayBtn(it.es)}<div><div class="es">${esc(it.es)} ${known(it.id) ? `<span class="known">✓</span>` : ""}</div>
    <div class="muted small">${esc(it.type === "num" ? it.en : it.en)}${sub}</div>${it.note ? `<div class="small" style="color:var(--warn)">${esc(it.note)}</div>` : ""}</div></div>`;
}
function openDeck(id) {
  const d = C.decks.find(d => d.id === id); $("#view").onclick = null; window.scrollTo(0, 0);
  const left = d.ids.filter(i => !known(i)).length;
  $("#view").innerHTML = `<p class="eyebrow">${d.kind === "phrases" ? "Phrases" : "Words · " + d.level}</p><h1>${esc(d.title)}</h1>
    <div class="btn-row"><button class="btn ghost" id="back">Back</button><button class="btn" id="learn" ${left ? "" : "disabled"}>${left ? `Learn ${Math.min(10, left)} from this list` : "All learned"}</button></div>
    <button class="btn secondary" id="focus" ${S.settings.focus === id ? "disabled" : ""}>${S.settings.focus === id ? "This is your focus list" : "Make this my focus list"}</button>
    <section class="panel">${d.ids.map(i => wordLine(C.items[i])).join("")}</section>`;
  $("#back").onclick = () => route("words");
  $("#learn").onclick = () => startNewWords(10, id);
  $("#focus").onclick = () => { S.settings.focus = id; save(); openDeck(id); toast("New words will come from this list first."); };
}

/* ---------------- Session runner ---------------- */
function runSession(queue, opts) {
  $("#view").onclick = null;
  queue = queue.slice();
  const total = queue.filter(x => typeof x === "string").length;
  const seen = new Set(); const tally = { ok: 0, warn: 0, bad: 0 }; let i = 0, answered = 0;
  const step = () => {
    window.scrollTo(0, 0);
    if (i >= queue.length) return finish();
    const x = queue[i];
    if (typeof x !== "string") return renderIntro(x, opts, () => { i++; step(); });
    const info = cardInfo(x);
    if (!info) { i++; return step(); }
    const ctx = { title: opts.title, frac: answered / total, fresh: !known(x), id: x };
    renderCard(x, info, ctx, (res, cells) => {
      tally[res]++;
      if (!seen.has(x)) { grade(x, res, cells); answered++; }
      if (res === "bad" && !seen.has(x)) queue.push(x);
      seen.add(x); save(); i++; step();
    });
  };
  const finish = () => {
    if (opts.onFinish) opts.onFinish();
    $("#view").innerHTML = `<p class="eyebrow">${esc(opts.title)}</p><h1>${opts.learning ? "Done" : "Review done"}</h1>
      <section class="panel"><div class="stat-grid">
        <div class="stat"><b>${tally.ok}</b><span class="muted small">correct</span></div>
        <div class="stat"><b>${tally.warn}</b><span class="muted small">correct, accent missing</span></div>
        <div class="stat"><b>${tally.bad}</b><span class="muted small">to practise again</span></div>
        <div class="stat"><b>${streak()}</b><span class="muted small">day streak</span></div></div>
        <p class="muted small">Everything you just did now comes back in your daily reviews.</p></section>
      <button class="btn block" id="home">Back to Today</button>`;
    $("#home").onclick = () => route("today");
  };
  step();
}
function header(ctx) {
  return `<div class="spread"><p class="eyebrow">${esc(ctx.title)}</p><button class="chip" id="quit">End</button></div>
    <div class="progress-bar" aria-hidden="true"><span style="width:${Math.round(ctx.frac * 100)}%"></span></div>`;
}
function wireQuit() { $("#quit").onclick = () => route(current === "today" ? "today" : current); }
function renderIntro(x, opts, next) {
  if (x.intro === "words") {
    $("#view").innerHTML = `${header({ title: opts.title, frac: 0 })}<h2>${esc(x.title || "New words")}</h2>
      <p class="muted small">Tap to listen and say each one out loud. Then you'll type them from memory.</p>
      <section class="panel">${x.ids.map(id => wordLine(C.items[id])).join("")}</section>
      <button class="btn block" id="next">Practise these (${x.ids.length})</button>`;
  } else if (x.intro === "verbs") {
    $("#view").innerHTML = `${header({ title: opts.title, frac: 0 })}<h2>Verb tables</h2>
      <p class="muted small">Read each table out loud. Then you'll fill them in from memory.</p>
      ${x.ids.map(v => `<section class="panel"><div class="spread"><div><h2>${esc(v)}</h2><p class="muted small">${esc(C.verbs[v].en)} · ${esc(C.verbs[v].group)}</p></div>${sayBtn(verbForms(v).join(", "), v)}</div>${verbTable(v)}</section>`).join("")}
      <button class="btn block" id="next">Practise these (${x.ids.length})</button>`;
  } else {
    $("#view").innerHTML = `${header({ title: opts.title, frac: 0 })}<section class="panel">${x.html}</section><button class="btn block" id="next">Continue</button>`;
  }
  wireQuit(); $("#next").onclick = next;
}
function verbTable(inf) {
  const f = verbForms(inf);
  return `<div class="table-wrap"><table><tbody>${PERSONS.map((p, i) => `<tr><td class="muted">${p}</td><td><strong>${esc(f[i])}</strong></td></tr>`).join("")}</tbody></table></div>`;
}

/* ---------------- Cards on screen ---------------- */
function pickMode(info, ctx) {
  if (info.kind !== "word") return "type";
  if (ctx.fresh) return "type";
  const it = info.item, opts = [["type", 40], ["flip", 15], ["listen", 15]];
  if (it.type === "n" && it.plural) opts.push(["plural", 20]);
  if (it.type === "a") opts.push(["form", 20]);
  if (canSpeak()) opts.push(["speak", 15]);
  let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
  for (const [m, w] of opts) { r -= w; if (r < 0) return m; }
  return "type";
}
function renderCard(id, info, ctx, done) {
  if (info.kind === "verb") return renderVerb(id, info, ctx, done);
  const mode = pickMode(info, ctx);
  if (mode === "flip") return renderFlip(info, ctx, done);
  if (mode === "speak") return renderSpeak(info, ctx, done);
  // Typed answer: build prompt and answers for this mode.
  let prompt, hint, answers, say, note = info.note, isHtml = false, sentence = !!info.sentence, noun = null;
  if (info.kind === "word") {
    const it = info.item; say = it.es; note = it.note;
    if (mode === "listen") { prompt = ""; hint = "Listen, then type what you hear"; answers = [it.es]; }
    else if (mode === "plural") { prompt = it.en; hint = "plural, with los / las"; answers = [it.plural]; say = it.plural; }
    else if (mode === "form") { const k = 1 + Math.floor(Math.random() * 3); prompt = it.en; hint = FORM_LABELS[k]; answers = [it.forms[k]]; say = it.forms[k]; }
    else {
      prompt = it.type === "num" ? it.en : it.en;
      hint = it.type === "n" ? "noun · with el / la" : it.type === "a" ? "adjective · masculine singular" : it.type === "num" ? "number · write it in words" : it.type === "phrase" ? "phrase" : "word";
      answers = [it.type === "a" ? it.forms[0] : it.es];
      if (it.type === "n") noun = it.es.split(" ").slice(1).join(" ");
    }
  } else if (info.kind === "meaning") {
    prompt = info.verb.en; hint = "verb · infinitive"; answers = [info.inf]; say = info.inf;
  } else {
    prompt = info.prompt; hint = info.hint; answers = info.answers; say = info.say || info.answers[0]; isHtml = !!info.html;
  }
  const mic = canSpeak() ? `<button class="icon-btn" id="mic" aria-label="Answer by speaking">${ICON.mic}</button>` : "";
  $("#view").innerHTML = `${header(ctx)}<section class="panel">
    <p class="small muted">${esc(hint)}${ctx.fresh && info.kind === "word" ? " · new" : ""}</p>
    ${mode === "listen" ? `<div class="row"><button class="icon-btn big" data-say="${esc(say)}" aria-label="Play again">${ICON.speaker}</button><span class="muted">Tap to hear it again</span></div>` : `<p class="prompt">${isHtml ? prompt : esc(prompt)}</p>`}
    <div class="row" style="flex-wrap:nowrap"><input type="text" id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Your answer in Spanish">${mic}</div>
    ${keysHtml()}<div id="fb"></div>
    <div class="btn-row" id="btns"><button class="btn ghost" id="dunno">Don't know</button><button class="btn" id="check">Check</button></div></section>`;
  wireQuit();
  const inp = $("#ans"); inp.focus(); wireKeys(() => inp);
  if (mode === "listen") setTimeout(() => speak(say), 250);
  inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); (state ? $("#cont") : $("#check")).click(); } };
  if ($("#mic")) $("#mic").onclick = () => listen($("#mic"), alts => { inp.value = alts[0]; });
  let state = null;
  const show = (res, extra) => {
    state = res; inp.readOnly = true; inp.className = res;
    const right = answers[0];
    $("#fb").innerHTML = `<div class="feedback ${res}">
      <strong>${res === "ok" ? "Correct" : res === "warn" ? `Correct, but watch the accent: ${esc(right)}` : `The answer is: ${esc(right)}`}</strong>
      ${extra ? `<span>${esc(extra)}</span>` : ""}${note ? `<span class="small">${esc(note)}</span>` : ""}
      ${answers.length > 1 && res !== "ok" ? `<span class="small muted">Also accepted: ${answers.slice(1).map(esc).join(" · ")}</span>` : ""}
      <div class="row">${sayBtn(say)}<span class="small">Listen and repeat</span></div>
      ${res === "bad" && inp.value ? `<button class="linkish" id="override">I was right, count it as correct</button>` : ""}</div>`;
    $("#btns").innerHTML = `<button class="btn block" id="cont" style="grid-column:1/-1">Continue</button>`;
    $("#cont").onclick = () => done(state); $("#cont").focus();
    if ($("#override")) $("#override").onclick = () => { state = "ok"; done("ok"); };
    if (res !== "bad") speak(say);
  };
  $("#check").onclick = () => {
    if (!inp.value.trim()) { inp.focus(); return; }
    const res = Core.grade(inp.value, answers, { sentence });
    let extra = "";
    if (res === "bad" && noun && Core.bare(inp.value) === Core.bare(noun)) extra = "Add the article: el or la.";
    show(res, extra);
  };
  $("#dunno").onclick = () => show("bad", "");
}
function renderFlip(info, ctx, done) {
  const it = info.item;
  $("#view").innerHTML = `${header(ctx)}<section class="panel">
    <p class="small muted">What does this mean?</p>
    <div class="spread"><p class="prompt-es">${esc(it.es)}</p>${sayBtn(it.es)}</div>
    <div id="fb"></div>
    <div class="btn-row" id="btns"><button class="btn ghost" id="dunno">Don't know</button><button class="btn" id="show">Show answer</button></div></section>`;
  wireQuit(); speak(it.es);
  $("#dunno").onclick = () => done("bad");
  $("#show").onclick = () => {
    $("#fb").innerHTML = `<div class="feedback ok"><strong>${esc(it.en)}</strong>${it.plural ? `<span class="small">plural: ${esc(it.plural)}</span>` : ""}</div>`;
    $("#btns").innerHTML = `<button class="btn ghost" id="no">Didn't know</button><button class="btn" id="yes">Knew it</button>`;
    $("#no").onclick = () => done("bad"); $("#yes").onclick = () => done("ok");
  };
}
function renderSpeak(info, ctx, done) {
  const it = info.item;
  $("#view").innerHTML = `${header(ctx)}<section class="panel">
    <p class="small muted">Say it in Spanish${it.type === "n" ? ", with el / la" : ""}</p>
    <p class="prompt">${esc(it.en)}</p>
    <div class="row"><button class="icon-btn big" id="mic" aria-label="Tap and speak">${ICON.mic}</button><span class="muted" id="heard">Tap and speak</span></div>
    <div id="fb"></div>
    <div class="btn-row" id="btns"><button class="btn ghost" id="dunno">Don't know</button><button class="btn secondary" id="typeinst">Type instead</button></div></section>`;
  wireQuit();
  const target = it.type === "a" ? it.forms[0] : it.es;
  const result = (res, heard) => {
    $("#fb").innerHTML = `<div class="feedback ${res}"><strong>${res === "ok" ? "Correct" : `The answer is: ${esc(target)}`}</strong>${heard ? `<span class="small">Heard: “${esc(heard)}”</span>` : ""}
      <div class="row">${sayBtn(target)}<span class="small">Listen and repeat</span></div>${res === "bad" && heard ? `<button class="linkish" id="override">I said it right, count it as correct</button>` : ""}</div>`;
    $("#btns").innerHTML = `<button class="btn block" id="cont" style="grid-column:1/-1">Continue</button>`;
    let st = res; $("#cont").onclick = () => done(st);
    if ($("#override")) $("#override").onclick = () => done("ok");
    speak(target);
  };
  $("#mic").onclick = () => listen($("#mic"), alts => {
    const hit = alts.find(a => Core.bare(a) === Core.bare(target));
    result(hit ? "ok" : "bad", hit || alts[0]);
  });
  $("#dunno").onclick = () => result("bad", "");
  $("#typeinst").onclick = () => renderCard(ctx.id, info, Object.assign({}, ctx, { fresh: true }), done);
}
function renderVerb(id, info, ctx, done) {
  const c = S.cards[id]; const weak = (c && c.cells) || [0, 0, 0, 0, 0, 0];
  const mic = canSpeak() ? `<button class="icon-btn" id="mic" aria-label="Say all six forms">${ICON.mic}</button>` : "";
  $("#view").innerHTML = `${header(ctx)}<section class="panel">
    <p class="small muted">Present tense · ${esc(info.verb.en)}</p>
    <div class="spread"><p class="prompt">${esc(info.inf)}</p>${mic}</div>
    <div class="verb-grid">${PERSONS.map((p, k) => `<label for="f${k}" class="${weak[k] > 0 ? "weak" : ""}">${p}</label><input type="text" id="f${k}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">`).join("")}</div>
    ${keysHtml()}<div id="fb"></div>
    <div class="btn-row" id="btns"><button class="btn ghost" id="dunno">Don't know</button><button class="btn" id="check">Check</button></div></section>
    ${weak.some(w => w > 0) ? `<p class="small muted">● marks persons you've got wrong before.</p>` : ""}`;
  wireQuit();
  const inputs = $$(".verb-grid input"); let last = inputs[0];
  inputs.forEach((inp, k) => { inp.onfocus = () => last = inp; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); if (state) $("#cont").click(); else if (k < 5) inputs[k + 1].focus(); else $("#check").click(); } }; });
  const first = inputs.findIndex((_, k) => weak[k] > 0); inputs[first >= 0 ? first : 0].focus();
  wireKeys(() => last);
  if ($("#mic")) $("#mic").onclick = () => listen($("#mic"), alts => {
    const words = alts[0].toLowerCase().replace(/[,.]/g, " ").split(/\s+/).filter(Boolean);
    const reflexive = info.forms[0].includes(" ");
    const per = reflexive ? 2 : 1;
    if (words.length >= 6 * per) inputs.forEach((inp, k) => inp.value = words.slice(k * per, k * per + per).join(" "));
    else if (last) last.value = alts[0].toLowerCase();
  });
  let state = null;
  const show = cells => {
    cells.forEach((r, k) => { inputs[k].className = r; inputs[k].readOnly = true; if (r !== "ok") inputs[k].value = (inputs[k].value ? inputs[k].value + "  →  " : "") + info.forms[k]; });
    const res = cells.includes("bad") ? "bad" : cells.includes("warn") ? "warn" : "ok";
    const nBad = cells.filter(r => r === "bad").length;
    $("#fb").innerHTML = `<div class="feedback ${res}"><strong>${res === "ok" ? "All six correct" : res === "warn" ? "Correct, but check the accents" : `${nBad} of 6 to fix`}</strong>
      <div class="row">${sayBtn(info.forms.join(", "), info.inf)}<span class="small">${esc(info.forms.join(", "))}</span></div></div>`;
    state = { res, cells };
    $("#btns").innerHTML = `<button class="btn block" id="cont" style="grid-column:1/-1">Continue</button>`;
    $("#cont").onclick = () => done(state.res, state.cells); $("#cont").focus();
  };
  $("#check").onclick = () => show(inputs.map((inp, k) => Core.grade(inp.value, [info.forms[k]])));
  $("#dunno").onclick = () => show(inputs.map(() => "bad"));
}

/* ---------------- Library ---------------- */
let libFilter = "all", libQuery = "";
function renderLibrary() {
  const rows = [];
  Object.values(C.items).forEach(it => rows.push({ kind: it.type === "phrase" ? "phrases" : "words", it }));
  Object.keys(C.verbs).forEach(v => rows.push({ kind: "verbs", verb: v }));
  S.custom.forEach(c => rows.push({ kind: "words", custom: c }));
  allLessons().forEach(l => rows.push({ kind: "lessons", lesson: l }));
  const bq = Core.bare(libQuery);
  const text = r => r.it ? r.it.es + " " + r.it.en : r.verb ? r.verb + " " + C.verbs[r.verb].en + " " + verbForms(r.verb).join(" ") : r.custom ? r.custom.es + " " + r.custom.en : r.lesson.title + " " + (r.lesson.summary || "");
  const shown = rows.filter(r => (libFilter === "all" || r.kind === libFilter) && (!bq || Core.bare(text(r)).includes(bq)));
  const limited = shown.slice(0, 150);
  $("#view").innerHTML = `<h1>Library</h1>
    <input type="search" id="q" placeholder="Search Spanish or English" value="${esc(libQuery)}" aria-label="Search">
    <div class="row">${[["all", "All"], ["words", "Words"], ["verbs", "Verbs"], ["phrases", "Phrases"], ["lessons", "Rules"]].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${libFilter === k}">${l}</button>`).join("")}</div>
    <section class="panel" id="results">${limited.length ? limited.map(r => {
      if (r.it) return wordLine(r.it);
      if (r.custom) return `<div class="word-card">${sayBtn(r.custom.es)}<div><div class="es">${esc(r.custom.es)}</div><div class="muted small">${esc(r.custom.en)} · from class</div></div></div>`;
      if (r.verb) return `<div class="word-card">${sayBtn(verbForms(r.verb).join(", "), r.verb)}<div style="flex:1"><div class="es">${esc(r.verb)}</div><div class="muted small">${esc(C.verbs[r.verb].en)} · ${esc(C.verbs[r.verb].group)}</div><details><summary>Present tense</summary>${verbTable(r.verb)}</details></div></div>`;
      return `<div class="word-card"><div style="flex:1"><div class="es">${esc(r.lesson.title)}</div><div class="muted small">${esc(r.lesson.summary || "")}</div></div><button class="chip" data-open="${esc(r.lesson.id)}">Open</button></div>`;
    }).join("") : `<p class="muted">Nothing matches “${esc(libQuery)}”.</p>`}${shown.length > 150 ? `<p class="muted small">Showing 150 of ${shown.length}. Search to narrow it down.</p>` : ""}</section>`;
  const qi = $("#q");
  qi.oninput = () => { libQuery = qi.value; clearTimeout(renderLibrary.t); renderLibrary.t = setTimeout(() => { const pos = qi.selectionStart; renderLibrary(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); }, 200); };
  $$("[data-f]").forEach(b => b.onclick = () => { libFilter = b.dataset.f; renderLibrary(); });
  $$("[data-open]").forEach(b => b.onclick = () => openLesson(lessonById(b.dataset.open)));
}

/* ---------------- Me: progress, settings, add, backup ---------------- */
function renderMe() {
  const ids = Object.keys(S.cards);
  const count = p => ids.filter(id => id.startsWith(p)).length;
  const cells = [0, 0, 0, 0, 0, 0]; ids.filter(id => id.startsWith("v:")).forEach(id => (S.cards[id].cells || []).forEach((n, k) => cells[k] += n));
  const max = Math.max(1, ...cells);
  const tough = ids.filter(id => S.cards[id].lapses > 1 && cardInfo(id)).sort((a, b) => S.cards[b].lapses - S.cards[a].lapses).slice(0, 8);
  const label = id => { const i = cardInfo(id); return i.kind === "word" ? i.item.es : i.kind === "verb" || i.kind === "meaning" ? i.inf : i.answers[0]; };
  $("#view").innerHTML = `<h1>Me</h1>
  <div class="stat-grid">
    <div class="stat"><b>${count("w:") + count("c:")}</b><span class="muted small">words and phrases</span></div>
    <div class="stat"><b>${count("v:")}</b><span class="muted small">verb tables</span></div>
    <div class="stat"><b>${allLessons().filter(l => S.done[l.id]).length} / ${allLessons().length}</b><span class="muted small">lessons done</span></div>
    <div class="stat"><b>${streak()}</b><span class="muted small">day streak</span></div></div>
  <section class="panel"><p class="eyebrow">Verb mistakes by person</p>
    ${cells.some(n => n > 0) ? PERSONS.map((p, k) => `<div class="bar-row"><span class="small">${p}</span><div><div class="bar" style="width:${Math.round(cells[k] / max * 100)}%"></div></div><span class="small" style="text-align:right">${cells[k]}</span></div>`).join("")
      : `<p class="muted small">Once you practise verb tables, this shows which persons trip you up most.</p>`}</section>
  <section class="panel"><p class="eyebrow">Hardest cards</p>
    ${tough.length ? tough.map(id => `<div class="spread"><strong>${esc(label(id))}</strong><span class="muted small">missed ${S.cards[id].lapses}×</span></div>`).join("") : `<p class="muted small">Cards you miss more than once show here.</p>`}</section>
  <form class="panel" id="addf"><p class="eyebrow">Add a word from class</p>
    <label for="aes" class="small"><strong>Spanish</strong> (with el / la for nouns)</label><input type="text" id="aes" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="la estación">
    ${keysHtml()}
    <label for="aen" class="small"><strong>English</strong></label><input type="text" id="aen" autocomplete="off" placeholder="the station">
    <button class="btn" type="submit">Add to today's review</button>
    <p class="muted small">For a whole topic from class, ask Claude to add a lesson. It appears under Lessons.</p></form>
  <section class="panel"><p class="eyebrow">Settings</p>
    <label class="spread"><span>Speaking exercises</span><input type="checkbox" id="spk" ${S.settings.speak !== false ? "checked" : ""} style="width:22px;height:22px"></label>
    <p class="muted small">${SR ? "Your browser supports speech recognition." : "This browser doesn't support speech recognition. Use Chrome on Android."}</p></section>
  <section class="panel"><p class="eyebrow">Backup</p>
    <p class="muted small">Your progress is saved on this phone. Save a backup file now and then, so you can restore it if the browser data is cleared.</p>
    <div class="btn-row"><button class="btn secondary" id="imp">Restore</button><button class="btn" id="exp">Save backup</button></div>
    <input type="file" id="file" accept="application/json,.json" hidden><div id="impmsg"></div></section>`;
  let last = $("#aes"); $("#aes").onfocus = () => last = $("#aes"); $("#aen").onfocus = () => last = $("#aen"); wireKeys(() => last);
  $("#addf").onsubmit = e => {
    e.preventDefault(); const es = $("#aes").value.trim(), en = $("#aen").value.trim();
    if (!es || !en) { toast("Fill in both the Spanish and the English."); return; }
    const id = Date.now().toString(36); S.custom.push({ id, es, en }); S.cards["c:" + id] = { ivl: 0, ease: 2.5, reps: 0, lapses: 0, due: today() };
    save(); toast("Added to today's review."); renderMe();
  };
  $("#spk").onchange = e => { S.settings.speak = e.target.checked; save(); };
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify(S)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `paso-a-paso-backup-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
    toast("Backup saved to your downloads.");
  };
  $("#imp").onclick = () => $("#file").click();
  $("#file").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text()); if (!data.cards) throw new Error();
      $("#impmsg").innerHTML = `<p class="small">This backup has ${Object.keys(data.cards).length} cards. Restoring replaces your current progress (${Object.keys(S.cards).length} cards).</p><button class="btn block" id="confirmimp">Replace my progress</button>`;
      $("#confirmimp").onclick = () => { S = merge(data); save(); toast("Progress restored."); route("today"); };
    } catch (err) { toast("That file isn't a Paso a Paso backup."); }
  };
}

/* ---------------- Boot ---------------- */
(async () => {
  try { await loadContent(); route("today"); }
  catch (e) { $("#view").innerHTML = `<h1>Couldn't load lessons</h1><p class="muted">Check your connection and reload the page.</p>`; console.error(e); }
})();
