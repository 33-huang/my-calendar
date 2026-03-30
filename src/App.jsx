import { useState, useReducer, useCallback, useMemo, useEffect, useRef } from "react";

/* ═══════════════════════════════════════
   ⚠️ 部署前必须修改这两行：
   去 Supabase 项目 Settings → API 复制
   ═══════════════════════════════════════ */
const SUPABASE_URL = "https://hveabhjlelojuvxagzyl.supabase.co";
const SUPABASE_KEY = "sb_publishable_FRn1_CAe0CkOzgSPkE2Ukg_4kwULNMs";

/* ───── Supabase 轻量客户端（不需要安装 SDK）───── */
async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "",
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/* ───── data layer ───── */
async function loadEvents(owner) {
  try {
    return await supaFetch(`events?owner=eq.${encodeURIComponent(owner)}&order=date.asc`);
  } catch (e) { console.error("Load failed:", e); return []; }
}

async function insertEvent(event) {
  try {
    await supaFetch("events", {
      method: "POST",
      prefer: "return=minimal",
      body: JSON.stringify(event),
    });
  } catch (e) { console.error("Insert failed:", e); }
}

async function updateEvent(event) {
  try {
    await supaFetch(`events?id=eq.${encodeURIComponent(event.id)}`, {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({ date: event.date, time: event.time, content: event.content }),
    });
  } catch (e) { console.error("Update failed:", e); }
}

async function deleteEvent(id) {
  try {
    await supaFetch(`events?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (e) { console.error("Delete failed:", e); }
}

/* ───── uid ───── */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ───── NLP parser ───── */
function parseNL(text, today) {
  const t = today || new Date();
  const Y = t.getFullYear(), M = t.getMonth(), dow = t.getDay();
  let date = null, time = null, content = text.trim();
  const dp = [
    { r: /(\d{4})[年\/\-.](\d{1,2})[月\/\-.](\d{1,2})[日号]?/, f: m => new Date(+m[1], m[2] - 1, +m[3]) },
    { r: /(\d{1,2})[月\/\-.](\d{1,2})[日号]?/, f: m => new Date(Y, m[1] - 1, +m[2]) },
    { r: /(\d{1,2})[日号]/, f: m => new Date(Y, M, +m[1]) },
    { r: /大后天/, f: () => addD(t, 3) },
    { r: /后天/, f: () => addD(t, 2) },
    { r: /明天/, f: () => addD(t, 1) },
    { r: /今天/, f: () => addD(t, 0) },
    { r: /下下?(个)?周([一二三四五六日天])/, f: m => { const wd = wk(m[2]), diff = ((wd - dow + 7) % 7) || 7; return addD(t, diff + (m[0].startsWith("下下") ? 7 : 0)); } },
    { r: /(?:这个?)?周([一二三四五六日天])/, f: m => addD(t, wk(m[1]) - dow) },
    { r: /下(?:个)?星期([一二三四五六日天])/, f: m => { const diff = ((wk(m[1]) - dow + 7) % 7) || 7; return addD(t, diff); } },
    { r: /(?:这个?)?星期([一二三四五六日天])/, f: m => { const diff = ((wk(m[1]) - dow + 7) % 7); return addD(t, diff || 7); } },
    { r: /周末/, f: () => addD(t, ((6 - dow) + 7) % 7 || 7) },
  ];
  for (const p of dp) { const m = content.match(p.r); if (m) { date = p.f(m); content = content.replace(m[0], ""); break; } }
  const tp = [
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)?(\d{1,2})[:|：](\d{2})/, f: m => ({ h: ap(+m[2], m[1]), m: +m[3] }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)?(\d{1,2})点半/, f: m => ({ h: ap(+m[2], m[1]), m: 30 }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)?(\d{1,2})点(\d{1,2})分?/, f: m => ({ h: ap(+m[2], m[1]), m: +m[3] }) },
    { r: /(上午|早上|早晨|中午|下午|晚上|傍晚|凌晨)(\d{1,2})点/, f: m => ({ h: ap(+m[2], m[1]), m: 0 }) },
    { r: /(\d{1,2})点/, f: m => ({ h: +m[1], m: 0 }) },
    { r: /(上午|早上|早晨)/, f: () => ({ h: 9, m: 0 }) },
    { r: /中午/, f: () => ({ h: 12, m: 0 }) },
    { r: /下午/, f: () => ({ h: 14, m: 0 }) },
    { r: /(晚上|傍晚)/, f: () => ({ h: 19, m: 0 }) },
    { r: /凌晨/, f: () => ({ h: 2, m: 0 }) },
  ];
  for (const p of tp) { const m = content.match(p.r); if (m) { time = p.f(m); content = content.replace(m[0], ""); break; } }
  content = content.replace(/[，,。.、\s]+/g, " ").trim() || null;
  return { date, time, content };
}
function addD(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function wk(c) { return { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 }[c] ?? 0; }
function ap(h, p) { if (!p) return h; if ((p === "下午" || p === "晚上" || p === "傍晚") && h < 12) return h + 12; if ((p === "上午" || p === "早上" || p === "早晨" || p === "凌晨") && h === 12) return 0; return h; }
function ft(t) { if (!t) return null; return `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`; }
function dKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function pKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }

/* ───── icons ───── */
const IcoList = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>;
const IcoCal = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
const IcoL = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>;
const IcoR = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>;
const IcoTrash = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>;
const IcoEdit = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
const IcoX = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
const IcoCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>;
const IcoMic = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="1" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>;
const IcoPlus = () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;

/* ───── reducer ───── */
function reducer(s, a) {
  switch (a.type) {
    case "LOAD": return a.events;
    case "ADD": return [...s, a.event];
    case "UPDATE": return s.map(e => e.id === a.event.id ? a.event : e);
    case "DELETE": return s.filter(e => e.id !== a.id);
    default: return s;
  }
}

const WDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const MZH = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

/* ───── speech hook ───── */
function useSpeech() {
  const [listening, setL] = useState(false);
  const [transcript, setT] = useState("");
  const [supported, setS] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      setS(true); const r = new SR(); r.lang = "zh-CN"; r.interimResults = true; r.continuous = false;
      r.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setT(t); };
      r.onend = () => setL(false); r.onerror = () => setL(false); ref.current = r;
    }
  }, []);
  const start = useCallback(() => { if (ref.current && !listening) { setT(""); try { ref.current.start(); setL(true); } catch { } } }, [listening]);
  const stop = useCallback(() => { if (ref.current && listening) try { ref.current.stop(); } catch { } }, [listening]);
  return { listening, transcript, supported, start, stop };
}

const GRAD = "linear-gradient(135deg, #E879A8, #C084FC, #A78BFA)";

/* ═══════ LOGIN SCREEN ═══════ */
function LoginScreen({ onLogin }) {
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);

  // check saved session
  useEffect(() => {
    const saved = localStorage.getItem("cal-owner");
    if (saved) onLogin(saved);
  }, [onLogin]);

  const handleLogin = async () => {
    const p = phrase.trim();
    if (!p) return;
    setLoading(true);
    localStorage.setItem("cal-owner", p);
    onLogin(p);
  };

  return (
    <div style={LS.wrap}>
      {/* banner illustration */}
      <div style={LS.bannerWrap}>
        <svg viewBox="0 0 400 200" style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="lsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C4B5FD" />
              <stop offset="50%" stopColor="#DDD6FE" />
              <stop offset="100%" stopColor="#F0ABFC" />
            </linearGradient>
            <linearGradient id="lm1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0.4" /></linearGradient>
            <linearGradient id="lm2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" /></linearGradient>
            <linearGradient id="lm3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" /><stop offset="100%" stopColor="#A78BFA" stopOpacity="0.4" /></linearGradient>
            <linearGradient id="lsea" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C084FC" stopOpacity="0.4" /><stop offset="100%" stopColor="#E879A8" stopOpacity="0.3" /></linearGradient>
            <radialGradient id="lsun" cx="0.75" cy="0.25"><stop offset="0%" stopColor="#FDE68A" stopOpacity="0.8" /><stop offset="100%" stopColor="#FDE68A" stopOpacity="0" /></radialGradient>
          </defs>
          <rect width="400" height="200" fill="url(#lsky)" />
          <circle cx="320" cy="50" r="60" fill="url(#lsun)" />
          <circle cx="320" cy="50" r="18" fill="#FDE68A" opacity="0.5" />
          <circle cx="40" cy="30" r="1.5" fill="white" opacity="0.7" /><circle cx="100" cy="18" r="1" fill="white" opacity="0.5" /><circle cx="170" cy="35" r="1.2" fill="white" opacity="0.6" /><circle cx="240" cy="15" r="1.5" fill="white" opacity="0.4" />
          <polygon points="0,140 60,90 120,110 180,75 240,100 300,65 360,85 400,95 400,155 0,155" fill="url(#lm3)" />
          <polygon points="0,155 40,120 100,135 160,100 220,125 280,95 340,115 400,105 400,170 0,170" fill="url(#lm2)" />
          <polygon points="0,170 70,140 140,155 200,130 270,145 340,125 400,138 400,180 0,180" fill="url(#lm1)" />
          <rect y="170" width="400" height="30" fill="url(#lsea)" />
          <line x1="30" y1="178" x2="80" y2="178" stroke="white" strokeWidth="0.8" opacity="0.3" />
          <line x1="150" y1="182" x2="200" y2="182" stroke="white" strokeWidth="0.6" opacity="0.2" />
          <line x1="260" y1="176" x2="320" y2="176" stroke="white" strokeWidth="0.7" opacity="0.25" />
        </svg>
      </div>

      <div style={LS.content}>
        <div style={LS.title}>我的日历</div>
        <div style={LS.sub}>我们的征途是星辰大海</div>
        <div style={LS.desc}>输入你的专属口令，数据会安全保存在云端</div>
        <input
          style={LS.input}
          type="password"
          value={phrase}
          onChange={e => setPhrase(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleLogin(); }}
          placeholder="输入你的专属口令"
        />
        <button style={{ ...LS.btn, opacity: phrase.trim() ? 1 : 0.45 }} onClick={handleLogin} disabled={!phrase.trim() || loading}>
          {loading ? "进入中..." : "进入日历"}
        </button>
        <div style={LS.tip}>口令就是你的钥匙，请记住它</div>
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
  input: { width: "100%", padding: "14px 18px", border: "1.5px solid #E5E5E5", borderRadius: 14, fontSize: 16, outline: "none", background: "#fff", color: "#1A1A1A", textAlign: "center", boxSizing: "border-box", marginBottom: 14 },
  btn: { width: "100%", height: 50, borderRadius: 14, border: "none", background: GRAD, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", transition: "opacity .2s" },
  tip: { fontSize: 12, color: "#C0C0C0", marginTop: 16 },
};

/* ═══════ MAIN APP ═══════ */
function CalendarApp({ owner }) {
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
  const inputRef = useRef(null);
  const speech = useSpeech();

  useEffect(() => { loadEvents(owner).then(e => { dispatch({ type: "LOAD", events: e }); setLoading(false); }); }, [owner]);
  useEffect(() => { if (speech.transcript) setInputText(speech.transcript); }, [speech.transcript]);

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2200); }, []);

  const handleAdd = useCallback(async () => {
    const txt = inputText.trim(); if (!txt) return;
    const p = parseNL(txt, new Date());
    if (!p.date) { showToast("未能识别日期，请再试试", "error"); return; }
    if (!p.content) { showToast("未能识别事项内容", "error"); return; }
    const ev = { id: uid(), owner, date: dKey(p.date), time: p.time ? ft(p.time) : null, content: p.content };
    dispatch({ type: "ADD", event: ev });
    setInputText(""); setShowInput(false); speech.stop();
    showToast(`已添加：${p.content}`);
    setCY(p.date.getFullYear()); setCM(p.date.getMonth());
    await insertEvent(ev);
  }, [inputText, showToast, speech, owner]);

  const openInput = useCallback(() => { setInputText(""); setShowInput(true); setTimeout(() => inputRef.current?.focus(), 150); }, []);
  const closeInput = useCallback(() => { setShowInput(false); setInputText(""); speech.stop(); }, [speech]);
  const toggleMic = useCallback(() => { if (speech.listening) speech.stop(); else speech.start(); }, [speech]);

  const handleDel = useCallback(async (id) => { dispatch({ type: "DELETE", id }); showToast("已删除"); await deleteEvent(id); }, [showToast]);
  const handleUpd = useCallback(async (ev) => {
    const { _raw, ...clean } = ev;
    dispatch({ type: "UPDATE", event: clean }); setEditing(null); showToast("已更新"); await updateEvent(clean);
  }, [showToast]);

  const prev = () => { if (cM === 0) { setCY(y => y - 1); setCM(11); } else setCM(m => m - 1); };
  const next = () => { if (cM === 11) { setCY(y => y + 1); setCM(0); } else setCM(m => m + 1); };
  const goToday = () => { setCY(new Date().getFullYear()); setCM(new Date().getMonth()); };

  const eMap = useMemo(() => {
    const m = {}; events.forEach(e => { (m[e.date] = m[e.date] || []).push(e); });
    Object.values(m).forEach(a => a.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")));
    return m;
  }, [events]);

  const grid = useMemo(() => {
    const sd = new Date(cY, cM, 1).getDay(), dim = new Date(cY, cM + 1, 0).getDate();
    const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); while (c.length % 7) c.push(null); return c;
  }, [cY, cM]);

  const todayKey = dKey(new Date());

  const monthEvents = useMemo(() => {
    const pf = `${cY}-${String(cM + 1).padStart(2, "0")}`;
    return events.filter(e => e.date.startsWith(pf)).sort((a, b) => a.date === b.date ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.date.localeCompare(b.date));
  }, [events, cY, cM]);

  const grouped = useMemo(() => {
    const g = []; let cur = null;
    monthEvents.forEach(ev => { if (!cur || cur.date !== ev.date) { cur = { date: ev.date, items: [] }; g.push(cur); } cur.items.push(ev); });
    return g;
  }, [monthEvents]);

  const allSorted = useMemo(() => [...events].sort((a, b) => a.date === b.date ? (a.time || "99:99").localeCompare(b.time || "99:99") : a.date.localeCompare(b.date)), [events]);

  const dotColors = ["#E879A8", "#C084FC", "#A78BFA", "#F0ABCF"];
  const getDot = j => dotColors[j % dotColors.length];

  const logout = () => { localStorage.removeItem("cal-owner"); window.location.reload(); };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#C084FC", fontFamily: "sans-serif" }}>加载中...</div>;

  return (
    <div style={S.app}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={S.monthLabel}>{MZH[cM]}月</div>
        <div style={S.headerR}>
          <button style={S.todayBtn} onClick={goToday}>今天</button>
          <button style={S.arrBtn} onClick={prev}><IcoL /></button>
          <button style={S.arrBtn} onClick={next}><IcoR /></button>
          <div style={S.viewToggle}>
            <button style={{ ...S.togBtn, ...(view === "calendar" ? S.togActive : {}) }} onClick={() => setView("calendar")}><IcoCal /></button>
            <button style={{ ...S.togBtn, ...(view === "list" ? S.togActive : {}) }} onClick={() => setView("list")}><IcoList /></button>
          </div>
        </div>
      </div>

      {/* BANNER */}
      <div style={S.bannerWrap}>
        <div style={S.banner}>
          <svg viewBox="0 0 400 140" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 16 }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" /><stop offset="50%" stopColor="#DDD6FE" /><stop offset="100%" stopColor="#F0ABFC" /></linearGradient>
              <linearGradient id="sea" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C084FC" stopOpacity="0.4" /><stop offset="100%" stopColor="#E879A8" stopOpacity="0.3" /></linearGradient>
              <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.6" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0.4" /></linearGradient>
              <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity="0.7" /><stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.5" /></linearGradient>
              <linearGradient id="m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.6" /><stop offset="100%" stopColor="#A78BFA" stopOpacity="0.4" /></linearGradient>
              <radialGradient id="sun" cx="0.75" cy="0.3"><stop offset="0%" stopColor="#FDE68A" stopOpacity="0.8" /><stop offset="100%" stopColor="#FDE68A" stopOpacity="0" /></radialGradient>
            </defs>
            <rect width="400" height="140" fill="url(#sky)" />
            <circle cx="320" cy="38" r="50" fill="url(#sun)" /><circle cx="320" cy="38" r="14" fill="#FDE68A" opacity="0.6" />
            <circle cx="40" cy="20" r="1.2" fill="white" opacity="0.7" /><circle cx="90" cy="12" r="0.8" fill="white" opacity="0.5" /><circle cx="150" cy="25" r="1" fill="white" opacity="0.6" /><circle cx="200" cy="10" r="1.3" fill="white" opacity="0.4" /><circle cx="260" cy="18" r="0.9" fill="white" opacity="0.5" />
            <polygon points="0,95 50,55 100,75 150,48 210,70 260,42 310,65 360,50 400,68 400,105 0,105" fill="url(#m3)" />
            <polygon points="0,105 30,78 80,90 130,62 180,82 230,58 280,78 330,65 380,80 400,72 400,115 0,115" fill="url(#m2)" />
            <polygon points="0,115 60,88 110,100 170,80 220,95 270,75 340,92 400,82 400,125 0,125" fill="url(#m1)" />
            <rect y="115" width="400" height="25" fill="url(#sea)" />
            <line x1="30" y1="122" x2="70" y2="122" stroke="white" strokeWidth="0.8" opacity="0.3" /><line x1="200" y1="120" x2="250" y2="120" stroke="white" strokeWidth="0.7" opacity="0.3" /><line x1="350" y1="125" x2="390" y2="125" stroke="white" strokeWidth="0.6" opacity="0.25" />
          </svg>
          <div style={S.bannerText}>
            <div style={S.bannerQuote}>我们的征途是星辰大海</div>
          </div>
        </div>
      </div>

      {/* CALENDAR VIEW */}
      {view === "calendar" && <>
        <div style={S.calCard}>
          <div style={S.calGrid}>
            {WDAYS.map(d => <div key={d} style={S.dow}>{d}</div>)}
            {grid.map((day, i) => {
              if (day === null) return <div key={"e" + i} style={S.cell} />;
              const key = `${cY}-${String(cM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const isToday = key === todayKey;
              const hasEv = !!eMap[key]?.length;
              const isSel = selDay === key && !isToday;
              return (
                <div key={key} style={{ ...S.cell, ...(isSel ? S.cellSel : {}) }} onClick={() => setSelDay(selDay === key ? null : key)}>
                  <div style={{ ...S.dayNum, ...(isToday ? S.dayToday : {}), ...(hasEv && !isToday ? S.dayHasEv : {}), fontWeight: hasEv || isToday ? 700 : 400 }}>{day}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={S.schedArea}>
          <div style={S.schedHeader}>
            {selDay ? (() => { const d = pKey(selDay); return <><span style={S.schedDate}>{d.getMonth() + 1}月{d.getDate()}日</span><span style={S.schedWk}> 周{WDAYS[d.getDay()]}</span></>; })()
              : <span style={S.schedDate}>本月安排</span>}
          </div>
          {selDay ? (<>
            {(eMap[selDay] || []).length === 0 && <div style={S.empty}>当天暂无安排</div>}
            {(eMap[selDay] || []).map((ev, j) => (
              <div key={ev.id} style={S.evCard}>
                <div style={{ ...S.evDot, background: getDot(j) }} />
                <div style={S.evBody}><div style={S.evContent}>{ev.content}</div><div style={S.evTime}>{ev.time || "时间未定"}</div></div>
                <div style={S.evActs}>
                  <button style={S.iBtn} onClick={() => setEditing({ ...ev })}><IcoEdit /></button>
                  <button style={{ ...S.iBtn, color: "#EF4444" }} onClick={() => handleDel(ev.id)}><IcoTrash /></button>
                </div>
              </div>
            ))}
          </>) : (<>
            {grouped.length === 0 && <div style={S.empty}>暂无日程，点击 + 添加</div>}
            {grouped.map(g => { const d = pKey(g.date); return (<div key={g.date}><div style={S.groupLabel}>{d.getDate()}日 · 周{WDAYS[d.getDay()]}</div>{g.items.map((ev, j) => (<div key={ev.id} style={S.evCard} onClick={() => setSelDay(g.date)}><div style={{ ...S.evDot, background: getDot(j) }} /><div style={S.evBody}><div style={S.evContent}>{ev.content}</div><div style={S.evTime}>{ev.time || "时间未定"}</div></div></div>))}</div>); })}
          </>)}
        </div>
      </>}

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={S.listArea}>
          {allSorted.length === 0 && <div style={S.empty}>暂无日程</div>}
          {allSorted.map((ev, j) => { const d = pKey(ev.date); return (<div key={ev.id} style={{ marginBottom: 8 }}><div style={S.listDateLabel}>{d.getMonth() + 1}月{d.getDate()}日 · 周{WDAYS[d.getDay()]}</div><div style={S.evCard}><div style={{ ...S.evDot, background: getDot(j) }} /><div style={S.evBody}><div style={S.evContent}>{ev.content}</div><div style={S.evTime}>{ev.time || "时间未定"}</div></div><div style={S.evActs}><button style={S.iBtn} onClick={() => setEditing({ ...ev })}><IcoEdit /></button><button style={{ ...S.iBtn, color: "#EF4444" }} onClick={() => handleDel(ev.id)}><IcoTrash /></button></div></div></div>); })}
        </div>
      )}

      {/* FAB */}
      {!showInput && <button style={S.fab} onClick={openInput}><IcoPlus /></button>}

      {/* ADD SHEET */}
      {showInput && (
        <div style={S.overlay} onClick={closeInput}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.sheetHint}>{speech.listening ? "正在聆听..." : "说一句话或打字输入"}</div>
            <textarea ref={inputRef} style={S.sheetTA} value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAdd(); } }} placeholder={"明天下午3点开会\n周五提交资料\n下周二和朋友吃饭"} rows={3} />
            <div style={S.sheetBtnRow}>
              <button style={{ ...S.mainBtn, opacity: inputText.trim() ? 1 : 0.45 }} onClick={handleAdd} disabled={!inputText.trim()}>添加日程</button>
              {speech.supported && <button style={{ ...S.micBtn, ...(speech.listening ? S.micLive : {}) }} onClick={toggleMic}><IcoMic /></button>}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && <div style={{ ...S.toast, background: toast.type === "error" ? "#FEF2F2" : "#F0FDF4", color: toast.type === "error" ? "#DC2626" : "#16A34A", borderColor: toast.type === "error" ? "#FECACA" : "#BBF7D0" }}>{toast.msg}</div>}

      {/* EDIT SHEET */}
      {editing && (
        <div style={S.overlay} onClick={() => setEditing(null)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()}>
            <div style={S.sheetHandle} />
            <div style={S.editHeader}><span style={S.editTitle}>编辑事项</span><button style={S.iBtn} onClick={() => setEditing(null)}><IcoX /></button></div>
            <div style={{ marginTop: 8 }}>
              <div style={S.editHint}>直接修改这句话，系统会自动识别日期和时间</div>
              <textarea style={S.sheetTA} value={editing._raw || (() => { const d = pKey(editing.date); return `${d.getMonth() + 1}月${d.getDate()}日${editing.time ? " " + editing.time.replace(":", "点") : ""} ${editing.content}`; })()} onChange={e => { const raw = e.target.value; const p = parseNL(raw, new Date()); setEditing({ ...editing, _raw: raw, date: p.date ? dKey(p.date) : editing.date, time: p.time ? ft(p.time) : null, content: p.content || editing.content }); }} rows={2} />
              <div style={S.editPreview}>
                <div style={S.previewRow}><span style={S.previewLabel}>日期</span><span style={S.previewVal}>{(() => { const d = pKey(editing.date); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; })()}</span></div>
                <div style={S.previewRow}><span style={S.previewLabel}>时间</span><span style={S.previewVal}>{editing.time || "未定"}</span></div>
                <div style={S.previewRow}><span style={S.previewLabel}>内容</span><span style={S.previewVal}>{editing.content}</span></div>
              </div>
              <button style={S.saveBtn} onClick={() => handleUpd(editing)}><IcoCheck /><span style={{ marginLeft: 6 }}>保存</span></button>
            </div>
          </div>
        </div>
      )}

      {/* LOGOUT */}
      <div style={S.logoutWrap}>
        <button style={S.logoutBtn} onClick={logout}>退出登录</button>
      </div>
    </div>
  );
}

/* ═══════ STYLES ═══════ */
const S = {
  app: { fontFamily: "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB',sans-serif", maxWidth: 430, margin: "0 auto", background: "#F5F5F5", minHeight: "100vh", color: "#1A1A1A", fontSize: 14, paddingBottom: 100, position: "relative" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 6px" },
  monthLabel: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  headerR: { display: "flex", gap: 6, alignItems: "center" },
  todayBtn: { background: "#fff", border: "1px solid #E5E5E5", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#C084FC", cursor: "pointer" },
  arrBtn: { background: "none", border: "none", color: "#C084FC", cursor: "pointer", padding: 2 },
  bannerWrap: { padding: "0 16px", marginBottom: 4 },
  banner: { position: "relative", borderRadius: 16, height: 120, overflow: "hidden" },
  bannerText: { position: "absolute", bottom: 14, left: 18, zIndex: 1 },
  bannerQuote: { fontSize: 15, fontWeight: 700, color: "#fff", textShadow: "0 1px 8px rgba(107,70,193,0.5)", letterSpacing: 1 },
  viewToggle: { display: "flex", background: "#F3E8FF", borderRadius: 8, padding: 2 },
  togBtn: { background: "none", border: "none", padding: "5px 8px", borderRadius: 6, color: "#C0C0C0", cursor: "pointer", display: "flex", alignItems: "center" },
  togActive: { background: "#fff", color: "#C084FC", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
  calCard: { margin: "8px 16px 0", background: "#fff", borderRadius: 16, padding: "12px 8px 8px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)" },
  dow: { textAlign: "center", fontSize: 12, fontWeight: 500, color: "#C0C0C0", padding: "4px 0 8px" },
  cell: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 0 4px", cursor: "pointer", borderRadius: 10, minHeight: 44 },
  cellSel: { background: "#F9F0FF" },
  dayNum: { width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, borderRadius: "50%", color: "#333", transition: "all .15s" },
  dayToday: { background: GRAD, color: "#fff", fontWeight: 700 },
  dayHasEv: { border: "2px solid #D8B4FE", color: "#9333EA" },
  schedArea: { padding: "16px 20px 0" },
  schedHeader: { marginBottom: 12 },
  schedDate: { fontSize: 16, fontWeight: 700, background: GRAD, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  schedWk: { fontSize: 14, fontWeight: 500, color: "#C084FC" },
  groupLabel: { fontSize: 13, fontWeight: 600, color: "#999", margin: "14px 0 6px" },
  evCard: { display: "flex", alignItems: "center", background: "#fff", borderRadius: 12, marginBottom: 8, padding: "12px 14px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", cursor: "pointer" },
  evDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginRight: 12 },
  evBody: { flex: 1, minWidth: 0 },
  evContent: { fontSize: 15, fontWeight: 500, color: "#1A1A1A", lineHeight: 1.4 },
  evTime: { fontSize: 12, color: "#999", marginTop: 2 },
  evActs: { display: "flex", gap: 4, marginLeft: 8, flexShrink: 0 },
  iBtn: { background: "none", border: "none", color: "#999", cursor: "pointer", padding: 6, borderRadius: 8 },
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
  micBtn: { width: 50, height: 50, borderRadius: 14, border: "1.5px solid #E5E5E5", background: "#fff", color: "#666", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all .2s" },
  micLive: { background: "#FEF2F2", borderColor: "#FCA5A5", color: "#EF4444" },
  editHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  editTitle: { fontSize: 18, fontWeight: 700 },
  editHint: { fontSize: 13, color: "#999", marginBottom: 10 },
  editPreview: { background: "#F9FAFB", borderRadius: 12, padding: "10px 14px", marginBottom: 4 },
  previewRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" },
  previewLabel: { fontSize: 12, fontWeight: 600, color: "#C084FC" },
  previewVal: { fontSize: 13, fontWeight: 500, color: "#333" },
  saveBtn: { width: "100%", marginTop: 20, padding: "14px 0", border: "none", borderRadius: 14, background: GRAD, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 0.5 },
  toast: { position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", padding: "10px 22px", borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 999, border: "1px solid", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" },
  logoutWrap: { padding: "20px 20px 0", textAlign: "center" },
  logoutBtn: { background: "none", border: "none", color: "#C0C0C0", fontSize: 12, cursor: "pointer" },
};

/* ═══════ ROOT EXPORT ═══════ */
export default function App() {
  const [owner, setOwner] = useState(null);
  const handleLogin = useCallback((o) => setOwner(o), []);
  if (!owner) return <LoginScreen onLogin={handleLogin} />;
  return <CalendarApp owner={owner} />;
}