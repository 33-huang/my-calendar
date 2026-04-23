import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from "react";

/* ═══ Supabase ═══ */
const SUPABASE_URL = "https://hveabhjlelojuvxagzyl.supabase.co";
const SUPABASE_KEY = "sb_publishable_FRn1_CAe0CkOzgSPkE2Ukg_4kwULNMs";

async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": options.prefer || "", ...options.headers } });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
async function loadEvents(owner) { try { return await supaFetch(`events?owner=eq.${encodeURIComponent(owner)}&order=date.asc`); } catch (e) { console.error("Load failed:", e); return []; } }
async function insertEvent(event) { try { await supaFetch("events", { method: "POST", prefer: "return=minimal", body: JSON.stringify(event) }); } catch (e) { console.error("Insert failed:", e); } }
async function updateEvent(event) { try { await supaFetch(`events?id=eq.${encodeURIComponent(event.id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ date: event.date, time: event.time, content: event.content, done: event.done }) }); } catch (e) { console.error("Update failed:", e); } }
async function deleteEvent(id) { try { await supaFetch(`events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); } catch (e) { console.error("Delete failed:", e); } }

/* ═══ helpers ═══ */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function wk(c) { return { "\u4e00": 1, "\u4e8c": 2, "\u4e09": 3, "\u56db": 4, "\u4e94": 5, "\u516d": 6, "\u65e5": 0, "\u5929": 0 }[c] ?? 0; }
function wkJa(c) { return { "\u6708": 1, "\u706b": 2, "\u6c34": 3, "\u6728": 4, "\u91d1": 5, "\u571f": 6, "\u65e5": 0 }[c] ?? 0; }
function ap(h, p) { if (!p) return h; if ((p === "\u4e0b\u5348" || p === "\u665a\u4e0a" || p === "\u508d\u665a" || p === "\u5348\u5f8c") && h < 12) return h + 12; if ((p === "\u4e0a\u5348" || p === "\u65e9\u4e0a" || p === "\u65e9\u6668" || p === "\u51cc\u6668" || p === "\u5348\u524d") && h === 12) return 0; return h; }
function ft(t) { if (!t) return null; return `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`; }
function dKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function pKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }

/* ═══ NLP ═══ */
function parseNL(text, today) {
  const t = today || new Date(); const Y = t.getFullYear(), M = t.getMonth(), dow = t.getDay();
  let date = null, time = null, content = text.trim();
  const dp = [
    { r: /(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})[日号]?/, f: m => new Date(+m[1], m[2] - 1, +m[3]) },
    { r: /(\d{1,2})[月\/\-.](\d{1,2})[日号]?/, f: m => new Date(Y, m[1] - 1, +m[2]) },
    { r: /(\d{1,2})[日号]/, f: m => new Date(Y, M, +m[1]) },
    { r: /大后天/, f: () => addD(t, 3) },
    { r: /後日|あさって/, f: () => addD(t, 2) }, { r: /后天/, f: () => addD(t, 2) },
    { r: /明日|あした/, f: () => addD(t, 1) }, { r: /明天/, f: () => addD(t, 1) },
    { r: /今日|きょう/, f: () => addD(t, 0) }, { r: /今天/, f: () => addD(t, 0) },
    { r: /来週([月火水木金土日])/, f: m => { const wd = wkJa(m[1]), diff = ((wd - dow + 7) % 7) || 7; return addD(t, diff); } },
    { r: /下下?(个)?周([一二三四五六日天])/, f: m => { const wd = wk(m[2]), diff = ((wd - dow + 7) % 7) || 7; return addD(t, diff + (m[0].startsWith("下下") ? 7 : 0)); } },
    { r: /(?:这个?)?周([一二三四五六日天])/, f: m => addD(t, wk(m[1]) - dow) },
    { r: /下(?:个)?星期([一二三四五六日天])/, f: m => { const diff = ((wk(m[1]) - dow + 7) % 7) || 7; return addD(t, diff); } },
    { r: /(?:这个?)?星期([一二三四五六日天])/, f: m => { const diff = ((wk(m[1]) - dow + 7) % 7); return addD(t, diff || 7); } },
    { r: /([月火水木金土日])曜日?/, f: m => { const wd = wkJa(m[1]), diff = ((wd - dow + 7) % 7) || 7; return addD(t, diff); } },
    { r: /周末/, f: () => addD(t, ((6 - dow) + 7) % 7 || 7) },
  ];
  for (const p of dp) { const m = content.match(p.r); if (m) { date = p.f(m); content = content.replace(m[0], ""); break; } }
  const tp = [
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨|午前|午後)?(\d{1,2})[:|：](\d{2})/, f: m => ({ h: ap(+m[2], m[1]), m: +m[3] }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨|午前|午後)?(\d{1,2})点半/, f: m => ({ h: ap(+m[2], m[1]), m: 30 }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨|午前|午後)?(\d{1,2})点(\d{1,2})分?/, f: m => ({ h: ap(+m[2], m[1]), m: +m[3] }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨|午前|午後)(\d{1,2})[点時时]/, f: m => ({ h: ap(+m[2], m[1]), m: 0 }) },
    { r: /(\d{1,2})[点時时]/, f: m => ({ h: +m[1], m: 0 }) },
    { r: /(上午|早上|早晨|午前)/, f: () => ({ h: 9, m: 0 }) }, { r: /中午/, f: () => ({ h: 12, m: 0 }) },
    { r: /(下午|午後)/, f: () => ({ h: 14, m: 0 }) }, { r: /(晚上|傍晚|夜)/, f: () => ({ h: 19, m: 0 }) },
    { r: /凌晨/, f: () => ({ h: 2, m: 0 }) },
  ];
  for (const p of tp) { const m = content.match(p.r); if (m) { time = p.f(m); content = content.replace(m[0], ""); break; } }
  content = content.replace(/[，,。.、\s]+/g, " ").trim() || null;
  return { date, time, content };
}

/* ═══ icons ═══ */
const IcoList = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
const IcoCal = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const IcoL = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IcoR = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
const IcoEdit = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IcoX = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IcoCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>;
const IcoMic = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="1" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
const IcoPlus = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
const IcoCheckCircle = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="9 12 11.5 14.5 16 9.5" /></svg>;
const IcoImg = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>;
const IcoSettings = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>;

/* ═══ i18n ═══ */
const i18n = {
  zh: {
    wdays: ["\u65e5", "\u4e00", "\u4e8c", "\u4e09", "\u56db", "\u4e94", "\u516d"],
    months: ["\u4e00", "\u4e8c", "\u4e09", "\u56db", "\u4e94", "\u516d", "\u4e03", "\u516b", "\u4e5d", "\u5341", "\u5341\u4e00", "\u5341\u4e8c"],
    monthSuffix: "\u6708", today: "\u4eca\u5929", thisMonth: "\u672c\u6708\u5b89\u6392",
    noEvents: "\u6682\u65e0\u65e5\u7a0b\uff0c\u70b9\u51fb + \u6dfb\u52a0", noEventsDay: "\u5f53\u5929\u6682\u65e0\u5b89\u6392",
    viewAll: "\u67e5\u770b\u5168\u6708", addEvent: "\u6dfb\u52a0\u65e5\u7a0b", save: "\u4fdd\u5b58",
    edit: "\u7f16\u8f91\u4e8b\u9879", editHint: "\u76f4\u63a5\u4fee\u6539\u8fd9\u53e5\u8bdd\uff0c\u7cfb\u7edf\u4f1a\u81ea\u52a8\u8bc6\u522b\u65e5\u671f\u548c\u65f6\u95f4",
    dateLabel: "\u65e5\u671f", timeLabel: "\u65f6\u95f4", contentLabel: "\u5185\u5bb9",
    timeUndecided: "\u65f6\u95f4\u672a\u5b9a", inputHint: "\u8bf4\u4e00\u53e5\u8bdd\u6216\u6253\u5b57\u8f93\u5165",
    listening: "\u6b63\u5728\u8046\u542c...",
    placeholder: "\u660e\u5929\u4e0b\u5348\u0033\u70b9\u5f00\u4f1a\n\u5468\u4e94\u63d0\u4ea4\u8d44\u6599\n\u4e0b\u5468\u4e8c\u548c\u670b\u53cb\u5403\u996d",
    noDate: "\u672a\u80fd\u8bc6\u522b\u65e5\u671f\uff0c\u8bf7\u518d\u8bd5\u8bd5", noContent: "\u672a\u80fd\u8bc6\u522b\u4e8b\u9879\u5185\u5bb9",
    added: "\u5df2\u6dfb\u52a0\uff1a", deleted: "\u5df2\u5220\u9664", updated: "\u5df2\u66f4\u65b0",
    logout: "\u9000\u51fa\u767b\u5f55", upcoming: "\u5f85\u53d1\u751f", done: "\u5df2\u5b8c\u6210",
    deleteEvent: "\u5220\u9664\u6b64\u4e8b\u9879", confirmDelete: "\u786e\u8ba4\u5220\u9664\uff1f",
    loginTitle: "\u6211\u7684\u65e5\u5386", loginSub: "\u6211\u4eec\u7684\u5f81\u9014\u662f\u661f\u8fb0\u5927\u6d77",
    loginDesc: "\u8f93\u5165\u4f60\u7684\u4e13\u5c5e\u53e3\u4ee4\uff0c\u6570\u636e\u4f1a\u5b89\u5168\u4fdd\u5b58\u5728\u4e91\u7aef",
    loginPlaceholder: "\u8f93\u5165\u4f60\u7684\u4e13\u5c5e\u53e3\u4ee4", loginBtn: "\u8fdb\u5165\u65e5\u5386",
    loginLoading: "\u8fdb\u5165\u4e2d...", loginTip: "\u53e3\u4ee4\u5c31\u662f\u4f60\u7684\u94a5\u5319\uff0c\u8bf7\u8bb0\u4f4f\u5b83",
    weekPrefix: "\u5468",
    dayGroup: (day, wd) => `${day}\u65e5 \u00b7 \u5468${wd}`,
    dateDisplay: (m, d) => `${m}\u6708${d}\u65e5`,
    fullDate: (y, m, d) => `${y}\u5e74${m}\u6708${d}\u65e5`,
    listDate: (m, d, wd) => `${m}\u6708${d}\u65e5 \u00b7 \u5468${wd}`,
  },
  ja: {
    wdays: ["\u65e5", "\u6708", "\u706b", "\u6c34", "\u6728", "\u91d1", "\u571f"],
    months: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    monthSuffix: "\u6708", today: "\u4eca\u65e5", thisMonth: "\u4eca\u6708\u306e\u4e88\u5b9a",
    noEvents: "\u4e88\u5b9a\u306a\u3057\u3001+ \u3067\u8ffd\u52a0", noEventsDay: "\u3053\u306e\u65e5\u306e\u4e88\u5b9a\u306f\u3042\u308a\u307e\u305b\u3093",
    viewAll: "\u6708\u5168\u4f53\u3092\u898b\u308b", addEvent: "\u4e88\u5b9a\u3092\u8ffd\u52a0", save: "\u4fdd\u5b58",
    edit: "\u4e88\u5b9a\u3092\u7de8\u96c6", editHint: "\u3053\u306e\u6587\u3092\u76f4\u63a5\u4fee\u6b63\u3057\u3066\u304f\u3060\u3055\u3044",
    dateLabel: "\u65e5\u4ed8", timeLabel: "\u6642\u9593", contentLabel: "\u5185\u5bb9",
    timeUndecided: "\u6642\u9593\u672a\u5b9a", inputHint: "\u4e00\u8a00\u3067\u5165\u529b\u3001\u307e\u305f\u306f\u97f3\u58f0\u5165\u529b",
    listening: "\u805e\u3044\u3066\u3044\u307e\u3059...",
    placeholder: "\u660e\u65e5\u5348\u5f8c\u0033\u6642\u306b\u4f1a\u8b70\n\u91d1\u66dc\u65e5\u306b\u8cc7\u6599\u63d0\u51fa\n\u6765\u9031\u706b\u66dc\u65e5\u306b\u3054\u98ef",
    noDate: "\u65e5\u4ed8\u3092\u8a8d\u8b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f", noContent: "\u5185\u5bb9\u3092\u8a8d\u8b58\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f",
    added: "\u8ffd\u52a0\uff1a", deleted: "\u524a\u9664\u3057\u307e\u3057\u305f", updated: "\u66f4\u65b0\u3057\u307e\u3057\u305f",
    logout: "\u30ed\u30b0\u30a2\u30a6\u30c8", upcoming: "\u4e88\u5b9a", done: "\u5b8c\u4e86",
    deleteEvent: "\u3053\u306e\u4e88\u5b9a\u3092\u524a\u9664", confirmDelete: "\u524a\u9664\u3057\u307e\u3059\u304b\uff1f",
    loginTitle: "\u30de\u30a4\u30ab\u30ec\u30f3\u30c0\u30fc", loginSub: "\u661f\u3068\u6d77\u304c\u79c1\u305f\u3061\u306e\u65c5\u8def",
    loginDesc: "\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
    loginPlaceholder: "\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5165\u529b", loginBtn: "\u30ab\u30ec\u30f3\u30c0\u30fc\u306b\u5165\u308b",
    loginLoading: "\u8aad\u307f\u8fbc\u307f\u4e2d...", loginTip: "\u30d1\u30b9\u30ef\u30fc\u30c9\u3092\u5fd8\u308c\u306a\u3044\u3067\u304f\u3060\u3055\u3044",
    weekPrefix: "",
    dayGroup: (day, wd) => `${day}\u65e5\uff08${wd}\uff09`,
    dateDisplay: (m, d) => `${m}\u6708${d}\u65e5`,
    fullDate: (y, m, d) => `${y}\u5e74${m}\u6708${d}\u65e5`,
    listDate: (m, d, wd) => `${m}\u6708${d}\u65e5\uff08${wd}\uff09`,
  },
};

function useLang() {
  const [lang, setLang] = useState(() => localStorage.getItem("cal-lang") || "zh");
  const toggle = useCallback(() => { setLang(prev => { const next = prev === "zh" ? "ja" : "zh"; localStorage.setItem("cal-lang", next); return next; }); }, []);
  return { lang, t: i18n[lang], toggle };
}

/* ═══ reducer ═══ */
function reducer(s, a) {
  switch (a.type) {
    case "LOAD": return a.events;
    case "ADD": return [...s, a.event];
    case "UPDATE": return s.map(e => e.id === a.event.id ? a.event : e);
    case "DELETE": return s.filter(e => e.id !== a.id);
    case "TOGGLE_DONE": return s.map(e => e.id === a.id ? { ...e, done: !e.done } : e);
    default: return s;
  }
}

/* ═══ hooks ═══ */
function useSpeech() {
  const [listening, setL] = useState(false); const [transcript, setT] = useState(""); const [supported, setS] = useState(false); const ref = useRef(null);
  useEffect(() => { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (SR) { setS(true); const r = new SR(); r.lang = "zh-CN"; r.interimResults = true; r.continuous = false; r.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setT(t); }; r.onend = () => setL(false); r.onerror = () => setL(false); ref.current = r; } }, []);
  const start = useCallback(() => { if (ref.current && !listening) { setT(""); try { ref.current.start(); setL(true); } catch {} } }, [listening]);
  const stop = useCallback(() => { if (ref.current && listening) try { ref.current.stop(); } catch {} }, [listening]);
  return { listening, transcript, supported, start, stop };
}

function useSwipe(onLeft, onRight) {
  const sx = useRef(0); const sy = useRef(0);
  const onTouchStart = useCallback(e => { sx.current = e.touches[0].clientX; sy.current = e.touches[0].clientY; }, []);
  const onTouchEnd = useCallback(e => { const dx = e.changedTouches[0].clientX - sx.current; const dy = e.changedTouches[0].clientY - sy.current; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx > 0) onRight(); else onLeft(); } }, [onLeft, onRight]);
  return { onTouchStart, onTouchEnd };
}

const GRAD = "linear-gradient(135deg, #E879A8, #C084FC, #A78BFA)";

/* ═══ slide animation ═══ */
const calAnimStyle = document.createElement("style");
calAnimStyle.textContent = `
@keyframes calSlideLeft { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes calSlideRight { from { transform: translateX(-40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
`;
if (typeof document !== "undefined" && !document.getElementById("cal-anim")) { calAnimStyle.id = "cal-anim"; document.head.appendChild(calAnimStyle); }

/* ═══ LOGIN ═══ */
function LoginScreen({ onLogin, lang, t, toggleLang }) {
  const [phrase, setPhrase] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { const saved = localStorage.getItem("cal-owner"); if (saved) onLogin(saved); }, [onLogin]);
  const handleLogin = () => { const p = phrase.trim(); if (!p) return; setLoading(true); localStorage.setItem("cal-owner", p); onLogin(p); };
  return (
    <div style={LS.wrap}>
      <div style={LS.bannerWrap}>
        <svg viewBox="0 0 400 200" style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" /><stop offset="50%" stopColor="#DDD6FE" /><stop offset="100%" stopColor="#F0ABFC" /></linearGradient>
            <linearGradient id="lm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0.4" /></linearGradient>
            <linearGradient id="lm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" /></linearGradient>
            <linearGradient id="lm3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" /><stop offset="100%" stopColor="#A78BFA" stopOpacity="0.4" /></linearGradient>
            <linearGradient id="lsea" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C084FC" stopOpacity="0.4" /><stop offset="100%" stopColor="#E879A8" stopOpacity="0.3" /></linearGradient>
            <radialGradient id="lsun" cx="0.75" cy="0.25"><stop offset="0%" stopColor="#FDE68A" stopOpacity="0.8" /><stop offset="100%" stopColor="#FDE68A" stopOpacity="0" /></radialGradient>
          </defs>
          <rect width="400" height="200" fill="url(#lsky)" /><circle cx="320" cy="50" r="60" fill="url(#lsun)" /><circle cx="320" cy="50" r="18" fill="#FDE68A" opacity="0.5" />
          <circle cx="40" cy="30" r="1.5" fill="white" opacity="0.7" /><circle cx="100" cy="18" r="1" fill="white" opacity="0.5" /><circle cx="170" cy="35" r="1.2" fill="white" opacity="0.6" /><circle cx="240" cy="15" r="1.5" fill="white" opacity="0.4" />
          <polygon points="0,140 60,90 120,110 180,75 240,100 300,65 360,85 400,95 400,155 0,155" fill="url(#lm3)" />
          <polygon points="0,155 40,120 100,135 160,100 220,125 280,95 340,115 400,105 400,170 0,170" fill="url(#lm2)" />
          <polygon points="0,170 70,140 140,155 200,130 270,145 340,125 400,138 400,180 0,180" fill="url(#lm1)" />
          <rect y="170" width="400" height="30" fill="url(#lsea)" />
          <line x1="30" y1="178" x2="80" y2="178" stroke="white" strokeWidth="0.8" opacity="0.3" /><line x1="150" y1="182" x2="200" y2="182" stroke="white" strokeWidth="0.6" opacity="0.2" /><line x1="260" y1="176" x2="320" y2="176" stroke="white" strokeWidth="0.7" opacity="0.25" />
        </svg>
      </div>
      <div style={LS.content}>
        <button style={LS.langBtn} onClick={toggleLang}>{lang === "zh" ? "\u65e5\u672c\u8a9e" : "\u4e2d\u6587"}</button>
        <div style={LS.title}>{t.loginTitle}</div>
        <div style={LS.sub}>{t.loginSub}</div>
        <div style={LS.desc}>{t.loginDesc}</div>
        <input style={LS.input} type="password" value={phrase} onChange={e => setPhrase(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleLogin(); }} placeholder={t.loginPlaceholder} />
        <button style={{ ...LS.btn, opacity: phrase.trim() ? 1 : 0.45 }} onClick={handleLogin} disabled={!phrase.trim() || loading}>{loading ? t.loginLoading : t.loginBtn}</button>
        <div style={LS.tip}>{t.loginTip}</div>
      </div>
    </div>
  );
}
const LS = {
  wrap: { fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif", maxWidth: 430, margin: "0 auto", background: "#F5F5F5", minHeight: "100vh" },
  bannerWrap: { width: "100%", height: 200, overflow: "hidden" },
  content: { padding: "24px 28px", textAlign: "center" },
  title: { fontSize: 28, fontWeight: 800, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 4 },
  sub: { fontSize: 14, color: "#A78BFA", fontWeight: 500, marginBottom: 24 },
  desc: { fontSize: 13, color: "#999", marginBottom: 20, lineHeight: 1.5 },
  langBtn: { background: "#F3E8FF", border: "none", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#C084FC", cursor: "pointer", marginBottom: 16 },
  input: { width: "100%", padding: "14px 18px", border: "1.5px solid #E5E5E5", borderRadius: 14, fontSize: 16, outline: "none", background: "#fff", color: "#1A1A1A", textAlign: "center", boxSizing: "border-box", marginBottom: 14 },
  btn: { width: "100%", height: 50, borderRadius: 14, border: "none", background: GRAD, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  tip: { fontSize: 12, color: "#C0C0C0", marginTop: 16 },
};

/* ═══ CALENDAR APP ═══ */
function CalendarApp({ owner, t }) {
  const [events, dispatch] = useReducer(reducer, []);
  const [view, setView] = useState("calendar");
  const [cY, setCY] = useState(new Date().getFullYear());
  const [cM, setCM] = useState(new Date().getMonth());
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(null);
  const [selDay, setSelDay] = useState(null);
  const [showInput, setShowInput] = useState(false);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [slideDir, setSlideDir] = useState(null);
  const [slideKey, setSlideKey] = useState(0);
  const inputRef = useRef(null);
  const speech = useSpeech();
  const [bannerQuote, setBannerQuote] = useState(() => localStorage.getItem("cal-banner-quote") || null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteInput, setQuoteInput] = useState("");
  const [bannerTextPos, setBannerTextPos] = useState(() => localStorage.getItem("cal-banner-text-pos") || "bl");
  const BT_POS = { tl: { top: 14, left: 18 }, tr: { top: 14, right: 18 }, bl: { bottom: 14, left: 18 }, br: { bottom: 14, right: 18 } };
  const [bannerImg, setBannerImg] = useState(() => localStorage.getItem("cal-banner-img") || null);
  const [bannerPos, setBannerPos] = useState(() => { try { return JSON.parse(localStorage.getItem("cal-banner-pos") || "null") || { x: 50, y: 50 }; } catch { return { x: 50, y: 50 }; } });
  const [cropImg, setCropImg] = useState(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropImgSize, setCropImgSize] = useState({ w: 1, h: 1 });
  const cropDragRef = useRef({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 });
  const bannerFileRef = useRef(null);
  const CROP_W = 350, CROP_H = 106;
  const getCropScale = (iw, ih) => Math.max(CROP_W / iw, CROP_H / ih);
  const clampCrop = (ox, oy, iw, ih) => { const sc = getCropScale(iw, ih), sw = iw * sc, sh = ih * sc; return { x: Math.min(0, Math.max(CROP_W - sw, ox)), y: Math.min(0, Math.max(CROP_H - sh, oy)) }; };
  const handleBannerUpload = useCallback(e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { const url = ev.target.result; const img = new Image(); img.onload = () => { setCropImgSize({ w: img.naturalWidth, h: img.naturalHeight }); setCropOffset({ x: 0, y: 0 }); }; img.src = url; setCropImg(url); }; r.readAsDataURL(f); e.target.value = ""; }, []);
  const confirmCrop = useCallback(() => { const sc = getCropScale(cropImgSize.w, cropImgSize.h), sw = cropImgSize.w * sc, sh = cropImgSize.h * sc; const px = sw > CROP_W ? (-cropOffset.x / (sw - CROP_W)) * 100 : 50; const py = sh > CROP_H ? (-cropOffset.y / (sh - CROP_H)) * 100 : 50; const pos = { x: Math.round(px), y: Math.round(py) }; localStorage.setItem("cal-banner-img", cropImg); localStorage.setItem("cal-banner-pos", JSON.stringify(pos)); setBannerImg(cropImg); setBannerPos(pos); setCropImg(null); }, [cropImg, cropOffset, cropImgSize]);
  const onCropStart = useCallback(e => { e.preventDefault(); const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; cropDragRef.current = { active: true, startX: cx, startY: cy, ox: cropOffset.x, oy: cropOffset.y }; }, [cropOffset]);
  const onCropMove = useCallback(e => { if (!cropDragRef.current.active) return; e.preventDefault(); const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; setCropOffset(clampCrop(cropDragRef.current.ox + cx - cropDragRef.current.startX, cropDragRef.current.oy + cy - cropDragRef.current.startY, cropImgSize.w, cropImgSize.h)); }, [cropImgSize]);
  const onCropEnd = useCallback(() => { cropDragRef.current.active = false; }, []);
  const resetBannerImg = useCallback(() => { localStorage.removeItem("cal-banner-img"); localStorage.removeItem("cal-banner-pos"); setBannerImg(null); setBannerPos({ x: 50, y: 50 }); }, []);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { loadEvents(owner).then(e => { dispatch({ type: "LOAD", events: e }); setLoading(false); }); }, [owner]);
  useEffect(() => { if (speech.transcript) setInputText(speech.transcript); }, [speech.transcript]);

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2200); }, []);

  const handleAdd = useCallback(async () => {
    const txt = inputText.trim(); if (!txt) return;
    const p = parseNL(txt, new Date());
    if (!p.date) { showToast(t.noDate, "error"); return; }
    if (!p.content) { showToast(t.noContent, "error"); return; }
    const ev = { id: uid(), owner, date: dKey(p.date), time: p.time ? ft(p.time) : null, content: p.content, done: false };
    dispatch({ type: "ADD", event: ev }); setInputText(""); setShowInput(false); speech.stop();
    showToast(`${t.added}${p.content}`); setCY(p.date.getFullYear()); setCM(p.date.getMonth());
    await insertEvent(ev);
  }, [inputText, showToast, speech, owner, t]);

  const openInput = useCallback(() => {
    if (selDay) { const d = pKey(selDay); setInputText(`${d.getMonth() + 1}\u6708${d.getDate()}\u65e5 `); } else { setInputText(""); }
    setShowInput(true); setTimeout(() => inputRef.current?.focus(), 150);
  }, [selDay]);
  const closeInput = useCallback(() => { setShowInput(false); setInputText(""); speech.stop(); }, [speech]);
  const saveQuote = useCallback(() => {
    const q = quoteInput.trim();
    if (q) { localStorage.setItem("cal-banner-quote", q); setBannerQuote(q); }
    setEditingQuote(false);
  }, [quoteInput]);
  const toggleMic = useCallback(() => { if (speech.listening) speech.stop(); else speech.start(); }, [speech]);

  const handleDel = useCallback(async (id) => { dispatch({ type: "DELETE", id }); setEditing(null); showToast(t.deleted); await deleteEvent(id); }, [showToast, t]);
  const handleToggle = useCallback(async (id) => { dispatch({ type: "TOGGLE_DONE", id }); const ev = events.find(e => e.id === id); if (ev) await updateEvent({ ...ev, done: !ev.done }); }, [events]);
  const handleUpd = useCallback(async (ev) => { const { _raw, ...clean } = ev; dispatch({ type: "UPDATE", event: clean }); setEditing(null); showToast(t.updated); await updateEvent(clean); }, [showToast, t]);

  const prev = () => { setSlideDir("right"); setSlideKey(k => k + 1); setSelDay(null); if (cM === 0) { setCY(y => y - 1); setCM(11); } else setCM(m => m - 1); };
  const next = () => { setSlideDir("left"); setSlideKey(k => k + 1); setSelDay(null); if (cM === 11) { setCY(y => y + 1); setCM(0); } else setCM(m => m + 1); };
  const goToday = () => { setSlideDir(null); setSlideKey(k => k + 1); setSelDay(null); setCY(new Date().getFullYear()); setCM(new Date().getMonth()); };

  const eMap = useMemo(() => { const m = {}; events.forEach(e => { (m[e.date] = m[e.date] || []).push(e); }); Object.values(m).forEach(a => a.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))); return m; }, [events]);
  const grid = useMemo(() => { const sd = new Date(cY, cM, 1).getDay(), dim = new Date(cY, cM + 1, 0).getDate(); const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); while (c.length % 7) c.push(null); return c; }, [cY, cM]);
  const todayKey = dKey(new Date());
  const monthEvents = useMemo(() => { const pf = `${cY}-${String(cM + 1).padStart(2, "0")}`; return events.filter(e => e.date.startsWith(pf)).sort((a, b) => a.date === b.date ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.date.localeCompare(b.date)); }, [events, cY, cM]);
  const grouped = useMemo(() => { const g = []; let cur = null; monthEvents.forEach(ev => { if (!cur || cur.date !== ev.date) { cur = { date: ev.date, items: [] }; g.push(cur); } cur.items.push(ev); }); return g; }, [monthEvents]);
  const allSorted = useMemo(() => [...events].sort((a, b) => a.date === b.date ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.date.localeCompare(b.date)), [events]);
  const swipe = useSwipe(next, prev);
  const logout = () => { localStorage.removeItem("cal-owner"); window.location.reload(); };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#C084FC", fontFamily: "sans-serif" }}>{t.loginLoading}</div>;

  const EvCard = ({ ev, onClick }) => (
    <div style={S.evCard} onClick={onClick}>
      <div style={S.evBody}><div style={S.evContent}>{ev.content}</div><div style={S.evTime}>{ev.time || t.timeUndecided}</div></div>
      <div style={S.evActs}>
        <button style={S.iBtn} onClick={e => { e.stopPropagation(); setEditing({ ...ev }); }}><IcoEdit /></button>
        <button style={S.iBtn} onClick={e => { e.stopPropagation(); handleToggle(ev.id); }}><IcoCheckCircle /></button>
      </div>
    </div>
  );
  const DoneCard = ({ ev }) => (
    <div style={{ ...S.evCard, opacity: 0.5 }}>
      <div style={S.evBody}><div style={{ ...S.evContent, textDecoration: "line-through", color: "#999" }}>{ev.content}</div><div style={S.evTime}>{ev.time || t.timeUndecided}</div></div>
      <div style={S.evActs}><button style={{ ...S.iBtn, color: "#C084FC" }} onClick={() => handleToggle(ev.id)}><IcoCheckCircle /></button></div>
    </div>
  );

  const slideAnim = slideDir === "left" ? "calSlideLeft .3s ease-out" : slideDir === "right" ? "calSlideRight .3s ease-out" : "none";

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.monthLabel}>{t.months[cM]}{t.monthSuffix}</div>
        <div style={S.headerR}>
          <button style={S.todayBtn} onClick={goToday}>{t.today}</button>
          <button style={S.arrBtn} onClick={prev}><IcoL /></button>
          <button style={S.arrBtn} onClick={next}><IcoR /></button>
          <div style={S.viewToggle}>
            <button style={{ ...S.togBtn, ...(view === "calendar" ? S.togActive : {}) }} onClick={() => setView("calendar")}><IcoCal /></button>
            <button style={{ ...S.togBtn, ...(view === "list" ? S.togActive : {}) }} onClick={() => setView("list")}><IcoList /></button>
          </div>
          <button style={S.arrBtn} onClick={() => setShowSettings(true)}><IcoSettings /></button>
        </div>
      </div>

      <div style={S.bannerWrap}>
        <div style={S.banner}>
          {bannerImg ? (
            <img src={bannerImg} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: `${bannerPos.x}% ${bannerPos.y}%`, borderRadius: 16 }} />
          ) : (
            <svg viewBox="0 0 400 140" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 16 }} preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" /><stop offset="50%" stopColor="#DDD6FE" /><stop offset="100%" stopColor="#F0ABFC" /></linearGradient>
                <linearGradient id="sea" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C084FC" stopOpacity="0.4" /><stop offset="100%" stopColor="#E879A8" stopOpacity="0.3" /></linearGradient>
                <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0.4" /></linearGradient>
                <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" /></linearGradient>
                <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" /><stop offset="100%" stopColor="#A78BFA" stopOpacity="0.4" /></linearGradient>
                <radialGradient id="sun" cx="0.75" cy="0.3"><stop offset="0%" stopColor="#FDE68A" stopOpacity="0.8" /><stop offset="100%" stopColor="#FDE68A" stopOpacity="0" /></radialGradient>
              </defs>
              <rect width="400" height="140" fill="url(#sky)" /><circle cx="320" cy="38" r="50" fill="url(#sun)" /><circle cx="320" cy="38" r="14" fill="#FDE68A" opacity="0.6" />
              <circle cx="40" cy="20" r="1.2" fill="white" opacity="0.7" /><circle cx="90" cy="12" r="0.8" fill="white" opacity="0.5" /><circle cx="150" cy="25" r="1" fill="white" opacity="0.6" /><circle cx="200" cy="10" r="1.3" fill="white" opacity="0.4" /><circle cx="260" cy="18" r="0.9" fill="white" opacity="0.5" />
              <polygon points="0,95 50,55 100,75 150,48 210,70 260,42 310,65 360,50 400,68 400,105 0,105" fill="url(#m3)" />
              <polygon points="0,105 30,78 80,90 130,62 180,82 230,58 280,78 330,65 380,80 400,72 400,115 0,115" fill="url(#m2)" />
              <polygon points="0,115 60,88 110,100 170,80 220,95 270,75 340,92 400,82 400,125 0,125" fill="url(#m1)" />
              <rect y="115" width="400" height="25" fill="url(#sea)" />
              <line x1="30" y1="122" x2="70" y2="122" stroke="white" strokeWidth="0.8" opacity="0.3" /><line x1="200" y1="120" x2="250" y2="120" stroke="white" strokeWidth="0.7" opacity="0.3" /><line x1="350" y1="125" x2="390" y2="125" stroke="white" strokeWidth="0.6" opacity="0.25" />
            </svg>
          )}
          <input type="file" accept="image/*" ref={bannerFileRef} style={{ display: "none" }} onChange={handleBannerUpload} />
          <div style={{ ...S.bannerText, ...BT_POS[bannerTextPos] }}>
            {editingQuote ? (
              <input
                autoFocus
                style={S.bannerInput}
                value={quoteInput}
                onChange={e => setQuoteInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveQuote(); if (e.key === "Escape") setEditingQuote(false); }}
                onBlur={saveQuote}
              />
            ) : (
              <div style={S.bannerQuote} onClick={() => { setQuoteInput(bannerQuote || t.loginSub); setEditingQuote(true); }} title="点击编辑">{bannerQuote || t.loginSub}</div>
            )}
          </div>
        </div>
      </div>

      {view === "calendar" && <>
        <div style={S.calCard} {...swipe}>
          <div key={slideKey} style={{ animation: slideAnim, overflow: "hidden" }}>
            <div style={S.calGrid}>
              {t.wdays.map(d => <div key={d} style={S.dow}>{d}</div>)}
              {grid.map((day, i) => {
                if (day === null) return <div key={"e" + i} style={S.cell} />;
                const key = `${cY}-${String(cM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isToday = key === todayKey;
                const dayEvs = eMap[key] || [];
                const hasEv = dayEvs.length > 0;
                const allDone = hasEv && dayEvs.every(e => e.done);
                const hasUndone = hasEv && dayEvs.some(e => !e.done);
                const isSel = selDay === key && !isToday;
                return (
                  <div key={key} style={{ ...S.cell, ...(isSel ? S.cellSel : {}) }} onClick={() => setSelDay(selDay === key ? null : key)}>
                    <div style={{ ...S.dayNum, ...(isToday ? S.dayToday : {}), ...(hasUndone && !isToday ? S.dayHasEv : {}), ...(allDone && !isToday ? S.dayAllDone : {}), fontWeight: hasEv || isToday ? 700 : 400 }}>{day}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div style={S.schedArea}>
          {selDay ? (<>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div><span style={S.schedDate}>{t.dateDisplay(pKey(selDay).getMonth() + 1, pKey(selDay).getDate())}</span><span style={S.schedWk}> {t.weekPrefix}{t.wdays[pKey(selDay).getDay()]}</span></div>
              <button style={{ ...S.iBtn, fontSize: 12, color: "#C084FC" }} onClick={() => setSelDay(null)}>{t.viewAll}</button>
            </div>
            {(eMap[selDay] || []).filter(e => !e.done).length === 0 && !(eMap[selDay] || []).some(e => e.done) && <div style={S.empty}>{t.noEventsDay}</div>}
            {(eMap[selDay] || []).filter(e => !e.done).map(ev => <EvCard key={ev.id} ev={ev} />)}
            {(eMap[selDay] || []).some(e => e.done) && <>
              <div style={S.doneLabel}>{t.done}</div>
              {(eMap[selDay] || []).filter(e => e.done).map(ev => <DoneCard key={ev.id} ev={ev} />)}
            </>}
          </>) : (<>
            <div style={S.schedHeader}><span style={S.schedDate}>{t.thisMonth}</span></div>
            {grouped.every(g => g.items.every(e => e.done)) && <div style={S.empty}>{t.noEvents}</div>}
            {grouped.map(g => {
              const d = pKey(g.date); const undone = g.items.filter(e => !e.done);
              if (undone.length === 0) return null;
              return (<div key={g.date}><div style={S.groupLabel}>{t.dayGroup(d.getDate(), t.wdays[d.getDay()])}</div>
                {undone.map(ev => <EvCard key={ev.id} ev={ev} onClick={() => setSelDay(g.date)} />)}</div>);
            })}
          </>)}
        </div>
      </>}

      {view === "list" && (
        <div style={S.listArea}>
          {allSorted.length === 0 && <div style={S.empty}>{t.noEvents}</div>}
          {allSorted.some(e => !e.done) && <>
            <div style={S.listSectionTitle}>{t.upcoming}</div>
            {allSorted.filter(e => !e.done).map(ev => { const d = pKey(ev.date); return (
              <div key={ev.id} style={{ marginBottom: 8 }}>
                <div style={S.listDateLabel}>{t.listDate(d.getMonth() + 1, d.getDate(), t.wdays[d.getDay()])}</div>
                <EvCard ev={ev} />
              </div>); })}
          </>}
          {allSorted.some(e => e.done) && <>
            <div style={{ ...S.listSectionTitle, color: "#999" }}>{t.done}</div>
            {allSorted.filter(e => e.done).map(ev => { const d = pKey(ev.date); return (
              <div key={ev.id} style={{ marginBottom: 8 }}>
                <div style={{ ...S.listDateLabel, color: "#C0C0C0" }}>{t.listDate(d.getMonth() + 1, d.getDate(), t.wdays[d.getDay()])}</div>
                <DoneCard ev={ev} />
              </div>); })}
          </>}
        </div>
      )}

      {!showInput && <button style={S.fab} onClick={openInput}><IcoPlus /></button>}

      {showInput && (
        <div style={S.overlay} onClick={closeInput}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.sheetHint}>{speech.listening ? t.listening : t.inputHint}</div>
            <textarea ref={inputRef} style={S.sheetTA} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }} placeholder={t.placeholder} rows={3} />
            <div style={S.sheetBtnRow}>
              <button style={{ ...S.mainBtn, opacity: inputText.trim() ? 1 : 0.45 }} onClick={handleAdd} disabled={!inputText.trim()}>{t.addEvent}</button>
              {speech.supported && <button style={{ ...S.micBtn, ...(speech.listening ? S.micLive : {}) }} onClick={toggleMic}><IcoMic /></button>}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ ...S.toast, background: toast.type === "error" ? "#FEF2F2" : "#F0FDF4", color: toast.type === "error" ? "#DC2626" : "#16A34A", borderColor: toast.type === "error" ? "#FECACA" : "#BBF7D0" }}>{toast.msg}</div>}

      {editing && (
        <div style={S.overlay} onClick={() => setEditing(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.editHeader}><span style={S.editTitle}>{t.edit}</span><button style={S.iBtn} onClick={() => setEditing(null)}><IcoX /></button></div>
            <div style={{ marginTop: 8 }}>
              <div style={S.editHint}>{t.editHint}</div>
              <textarea style={S.sheetTA} value={editing._raw || (() => { const d = pKey(editing.date); return `${d.getMonth() + 1}\u6708${d.getDate()}\u65e5${editing.time ? " " + editing.time.replace(":", "\u70b9") : ""} ${editing.content}`; })()} onChange={e => { const raw = e.target.value; const p = parseNL(raw, new Date()); setEditing({ ...editing, _raw: raw, date: p.date ? dKey(p.date) : editing.date, time: p.time ? ft(p.time) : null, content: p.content || editing.content }); }} rows={2} />
              <div style={S.editPreview}>
                <div style={S.previewRow}><span style={S.previewLabel}>{t.dateLabel}</span><span style={S.previewVal}>{(() => { const d = pKey(editing.date); return t.fullDate(d.getFullYear(), d.getMonth() + 1, d.getDate()); })()}</span></div>
                <div style={S.previewRow}><span style={S.previewLabel}>{t.timeLabel}</span><span style={S.previewVal}>{editing.time || t.timeUndecided}</span></div>
                <div style={S.previewRow}><span style={S.previewLabel}>{t.contentLabel}</span><span style={S.previewVal}>{editing.content}</span></div>
              </div>
              <button style={S.saveBtn} onClick={() => handleUpd(editing)}><IcoCheck /><span style={{ marginLeft: 6 }}>{t.save}</span></button>
              <div style={S.deleteWrap}><button style={S.deleteBtn} onClick={() => { if (window.confirm(t.confirmDelete)) handleDel(editing.id); }}>{t.deleteEvent}</button></div>
            </div>
          </div>
        </div>
      )}

      {cropImg && (
        <div style={S.overlay} onClick={() => setCropImg(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.editHeader}><span style={S.editTitle}>选择显示区域</span><button style={S.iBtn} onClick={() => setCropImg(null)}><IcoX /></button></div>
            <div style={{ fontSize: 13, color: "#999", textAlign: "center", margin: "10px 0 14px" }}>拖动图片，选择要显示的部分</div>
            <div style={{ width: 350, height: 106, overflow: "hidden", position: "relative", borderRadius: 12, margin: "0 auto", cursor: "grab", touchAction: "none", userSelect: "none" }}
              onMouseDown={onCropStart} onMouseMove={onCropMove} onMouseUp={onCropEnd} onMouseLeave={onCropEnd}
              onTouchStart={onCropStart} onTouchMove={onCropMove} onTouchEnd={onCropEnd}>
              <img src={cropImg} draggable={false} style={{ position: "absolute", width: cropImgSize.w * getCropScale(cropImgSize.w, cropImgSize.h), height: cropImgSize.h * getCropScale(cropImgSize.w, cropImgSize.h), left: cropOffset.x, top: cropOffset.y, pointerEvents: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button style={{ ...S.mainBtn, background: "#F0F0F0", color: "#999", flex: "0 0 80px", fontSize: 14 }} onClick={() => setCropImg(null)}>取消</button>
              <button style={S.mainBtn} onClick={confirmCrop}>确认使用</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div style={S.overlay} onClick={() => setShowSettings(false)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.editHeader}><span style={S.editTitle}>设置</span><button style={S.iBtn} onClick={() => setShowSettings(false)}><IcoX /></button></div>
            <div style={{ marginTop: 16 }}>
              <div style={S.settingsGroup}>个性化</div>
              <div style={S.settingsCard}>
                <button style={S.settingsRow} onClick={() => { setShowSettings(false); bannerFileRef.current?.click(); }}>
                  <IcoImg /><span style={S.settingsLabel}>更换 Banner 图片</span><span style={S.settingsArrow}>›</span>
                </button>
                <div style={S.settingsDivider} />
                <button style={S.settingsRow} onClick={() => { setShowSettings(false); setQuoteInput(bannerQuote || t.loginSub); setEditingQuote(true); }}>
                  <IcoEdit /><span style={S.settingsLabel}>修改 Banner 文字</span><span style={S.settingsArrow}>›</span>
                </button>
                <div style={S.settingsDivider} />
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>文字位置</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[["tl","↖ 左上"],["tr","↗ 右上"],["bl","↙ 左下"],["br","↘ 右下"]].map(([k, label]) => (
                      <button key={k} style={{ ...S.posBtn, ...(bannerTextPos === k ? S.posBtnActive : {}) }} onClick={() => { localStorage.setItem("cal-banner-text-pos", k); setBannerTextPos(k); }}>{label}</button>
                    ))}
                  </div>
                </div>
                {bannerImg && <><div style={S.settingsDivider} /><button style={S.settingsRow} onClick={() => { resetBannerImg(); setShowSettings(false); }}>
                  <IcoX /><span style={S.settingsLabel}>恢复默认插画</span><span style={S.settingsArrow}>›</span>
                </button></>}
              </div>
              <div style={{ ...S.settingsGroup, marginTop: 20 }}>账号</div>
              <div style={S.settingsCard}>
                <button style={{ ...S.settingsRow, color: "#C0C0C0" }} onClick={logout}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                  <span style={{ ...S.settingsLabel, color: "#C0C0C0" }}>{t.logout}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ STYLES ═══ */
const S = {
  app: { fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB',sans-serif", maxWidth: 430, margin: "0 auto", background: "#F5F5F5", minHeight: "100vh", color: "#1A1A1A", fontSize: 14, paddingBottom: 100, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 6px" },
  monthLabel: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  headerR: { display: "flex", gap: 6, alignItems: "center" },
  todayBtn: { background: "#fff", border: "1px solid #E5E5E5", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#C084FC", cursor: "pointer" },
  arrBtn: { background: "none", border: "none", color: "#C084FC", cursor: "pointer", padding: 2 },
  bannerWrap: { padding: "0 16px", marginBottom: 4 },
  banner: { position: "relative", borderRadius: 16, height: 120, overflow: "hidden" },
  bannerText: { position: "absolute", zIndex: 1 },
  bannerQuote: { fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: 1, cursor: "pointer" },
  bannerInput: { fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: 1, background: "rgba(255,255,255,0.15)", border: "none", borderBottom: "1.5px solid rgba(255,255,255,0.7)", outline: "none", width: 220, padding: "2px 4px", caretColor: "#fff" },
  settingsGroup: { fontSize: 11, fontWeight: 600, color: "#C084FC", letterSpacing: 0.5, marginBottom: 8, paddingLeft: 2 },
  settingsCard: { background: "#fff", borderRadius: 12, overflow: "hidden", border: "1px solid #F0F0F0" },
  settingsRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "14px 16px", background: "none", border: "none", cursor: "pointer", color: "#C084FC", textAlign: "left" },
  settingsLabel: { flex: 1, fontSize: 14, color: "#1A1A1A" },
  settingsArrow: { fontSize: 16, color: "#C0C0C0" },
  settingsDivider: { height: 1, background: "#F5F5F5", marginLeft: 44 },
  posBtn: { padding: "8px 0", borderRadius: 8, border: "1.5px solid #E5E5E5", background: "#fff", fontSize: 13, color: "#999", cursor: "pointer" },
  posBtnActive: { border: "1.5px solid #C084FC", background: "#F9F0FF", color: "#C084FC", fontWeight: 600 },
  viewToggle: { display: "flex", background: "#F3E8FF", borderRadius: 8, padding: 2 },
  togBtn: { background: "none", border: "none", padding: "5px 8px", borderRadius: 6, color: "#C0C0C0", cursor: "pointer", display: "flex", alignItems: "center" },
  togActive: { background: "#fff", color: "#C084FC", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  calCard: { margin: "8px 16px 0", background: "#fff", borderRadius: 16, padding: "12px 8px 8px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden", touchAction: "pan-y" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)" },
  dow: { textAlign: "center", fontSize: 12, fontWeight: 500, color: "#C0C0C0", padding: "4px 0 8px" },
  cell: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 4px", cursor: "pointer", borderRadius: 10, minHeight: 44 },
  cellSel: { background: "#F9F0FF" },
  dayNum: { width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, borderRadius: "50%", color: "#333", transition: "all .15s" },
  dayToday: { background: GRAD, color: "#fff", fontWeight: 700 },
  dayHasEv: { border: "2px solid #D8B4FE", color: "#9333EA" },
  dayAllDone: { border: "2px solid #EAEAEA", color: "#C0C0C0" },
  schedArea: { padding: "16px 20px 0" },
  schedHeader: { marginBottom: 12 },
  schedDate: { fontSize: 16, fontWeight: 700, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  schedWk: { fontSize: 14, fontWeight: 500, color: "#C084FC" },
  groupLabel: { fontSize: 13, fontWeight: 600, color: "#999", margin: "14px 0 6px" },
  evCard: { display: "flex", alignItems: "center", background: "#fff", borderRadius: 12, marginBottom: 8, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: "pointer" },
  evBody: { flex: 1, minWidth: 0 },
  evContent: { fontSize: 15, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.4 },
  evTime: { fontSize: 12, color: "#999", marginTop: 2 },
  evActs: { display: "flex", gap: 10, marginLeft: 12, flexShrink: 0, alignItems: "center" },
  iBtn: { background: "none", border: "none", color: "#C0C0C0", cursor: "pointer", padding: 4, borderRadius: 8 },
  doneLabel: { fontSize: 12, fontWeight: 600, color: "#C0C0C0", margin: "16px 0 6px" },
  listSectionTitle: { fontSize: 15, fontWeight: 700, color: "#C084FC", margin: "12px 0 8px" },
  empty: { textAlign: "center", color: "#C0C0C0", padding: "40px 0", fontSize: 14 },
  listArea: { padding: "8px 16px" },
  listDateLabel: { fontSize: 12, fontWeight: 600, color: "#C084FC", marginBottom: 4, paddingLeft: 2 },
  fab: { position: "fixed", bottom: 28, right: 24, width: 56, height: 56, borderRadius: "50%", border: "none", background: GRAD, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 20px rgba(192,132,252,0.4)", zIndex: 20 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 430, padding: "12px 20px 32px" },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, background: "#E5E5E5", margin: "0 auto 16px" },
  sheetHint: { fontSize: 13, color: "#999", textAlign: "center", marginBottom: 12 },
  sheetTA: { width: "100%", padding: "14px 16px", border: "1.5px solid #E5E5E5", borderRadius: 14, fontSize: 16, outline: "none", background: "#FAFAFA", color: "#1A1A1A", resize: "none", lineHeight: 1.6, boxSizing: "border-box", marginBottom: 14 },
  sheetBtnRow: { display: "flex", gap: 10, alignItems: "center" },
  mainBtn: { flex: 1, height: 50, borderRadius: 14, border: "none", background: GRAD, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "opacity .2s", letterSpacing: 0.5 },
  micBtn: { width: 50, height: 50, borderRadius: 14, border: "1.5px solid #E5E5E5", background: "#fff", color: "#666", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  micLive: { background: "#FEF2F2", borderColor: "#FCA5A5", color: "#EF4444" },
  editHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  editTitle: { fontSize: 18, fontWeight: 700 },
  editHint: { fontSize: 13, color: "#999", marginBottom: 10 },
  editPreview: { background: "#F9FAFB", borderRadius: 12, padding: "10px 14px", marginBottom: 4 },
  previewRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" },
  previewLabel: { fontSize: 12, fontWeight: 600, color: "#C084FC" },
  previewVal: { fontSize: 13, fontWeight: 500, color: "#333" },
  saveBtn: { width: "100%", marginTop: 20, padding: "14px 0", border: "none", borderRadius: 14, background: GRAD, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0.5 },
  deleteWrap: { textAlign: "center", marginTop: 16 },
  deleteBtn: { background: "none", border: "none", color: "#C0C0C0", fontSize: 14, fontWeight: 500, cursor: "pointer" },
  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 22px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 999, border: "1px solid", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" },
};

/* ═══ ROOT ═══ */
export default function App() {
  const [owner, setOwner] = useState(null);
  const { lang, t, toggle } = useLang();
  const handleLogin = useCallback(o => setOwner(o), []);
  if (!owner) return <LoginScreen onLogin={handleLogin} lang={lang} t={t} toggleLang={toggle} />;
  return <CalendarApp owner={owner} t={t} />;
}
