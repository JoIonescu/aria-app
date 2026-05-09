import { useState, useRef, useEffect, useCallback } from “react”;

const styleEl = document.createElement(“style”);
styleEl.textContent = `

- { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { background: #ECF0F5; margin: 0; overflow: hidden; }
  ::-webkit-scrollbar { width: 0; }
  @keyframes pulse-ring { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.9); opacity: 0; } }
  @keyframes breath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes dot-bounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-5px); } }
  @keyframes fab-pop { 0% { transform:scale(0.7); opacity:0; } 80% { transform:scale(1.08); } 100% { transform:scale(1); opacity:1; } }
  @keyframes slideIn { from { transform:translateY(100%); } to { transform:translateY(0); } }
  .btn-press:active { transform: scale(0.96); }
  textarea:focus, input:focus { outline: none; }
  textarea::placeholder, input::placeholder { color: #7A95A8; }
  textarea, input, select { font-size: 16px !important; }
  `;
  document.head.appendChild(styleEl);

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
bg: “#ECF0F5”, s1: “#E2E8EF”, s2: “#D6DDE7”, s3: “#C8D3DE”,
border: “#B4C2D0”, borderL: “#C0CCDA”,
accent: “#2B5F8C”, accentL: “rgba(43,95,140,0.15)”, accentG: “rgba(43,95,140,0.32)”,
text: “#12253A”, sub: “#3A5570”, dim: “#7A95A8”,
green: “#2E6B4A”, greenL: “rgba(46,107,74,0.14)”,
red: “#7A2E1E”, redL: “rgba(122,46,30,0.12)”,
blue: “#1A7A8A”, blueL: “rgba(26,122,138,0.14)”,
purple: “#4A3580”, purpleL: “rgba(74,53,128,0.14)”,
};
const F = “-apple-system, BlinkMacSystemFont, ‘Segoe UI’, Roboto, Helvetica, Arial, sans-serif”;
const PRI = { high: “#7A2E1E”, medium: “#2B5F8C”, low: “#7A95A8” };
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

// ── Claude API helper ─────────────────────────────────────────────────────────
const askClaude = async (system, userMsg) => {
const res = await fetch(“https://api.anthropic.com/v1/messages”, {
method: “POST”,
headers: { “Content-Type”: “application/json”, “x-api-key”: API_KEY, “anthropic-version”: “2023-06-01”, “anthropic-dangerous-direct-browser-access”: “true” },
body: JSON.stringify({ model: “claude-sonnet-4-20250514”, max_tokens: 400, system, messages: [{ role: “user”, content: userMsg }] }),
});
const data = await res.json();
return data.content[0].text.replace(/`json|`/g, “”).trim();
};

// ── Micro components ──────────────────────────────────────────────────────────
const Divider = () => <div style={{ height: 1, background: C.border }} />;

const SectionLabel = ({ label, count }) => (

  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 20px 8px" }}>
    <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.dim }}>{label}</span>
    {count !== undefined && <span style={{ fontFamily: F, fontSize: 10, color: C.accent, background: C.accentL, padding: "1px 7px", borderRadius: 3, fontWeight: 700 }}>{count}</span>}
  </div>
);

const ProcessingDots = ({ color = C.dim }) => (

  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
    {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: color, animation: `dot-bounce 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
  </div>
);

const EmptyState = ({ icon, text }) => (

  <div style={{ padding: "60px 20px", textAlign: "center" }}>
    <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontFamily: F, fontSize: 14, color: C.dim, lineHeight: 1.6 }}>{text}</div>
  </div>
);

// ── Swipeable Row (swipe left to delete) ──────────────────────────────────────
const SwipeableRow = ({ onDelete, children }) => {
const [offsetX, setOffsetX] = useState(0);
const [exiting, setExiting] = useState(false);
const startX = useRef(null);
const MAX = 80; const THRESH = 60;

const triggerDelete = useCallback(() => {
setExiting(true); setOffsetX(-400);
setTimeout(onDelete, 280);
}, [onDelete]);

const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
const onTouchMove = (e) => {
if (startX.current === null) return;
const dx = e.touches[0].clientX - startX.current;
if (dx < 0) setOffsetX(Math.max(dx, -MAX));
};
const onTouchEnd = () => { if (offsetX < -THRESH) triggerDelete(); else setOffsetX(0); startX.current = null; };

const onMouseDown = (e) => {
startX.current = e.clientX;
const onMove = (ev) => { const dx = ev.clientX - startX.current; if (dx < 0) setOffsetX(Math.max(dx, -MAX)); };
const onUp = () => { if (offsetX < -THRESH) triggerDelete(); else setOffsetX(0); startX.current = null; window.removeEventListener(“mousemove”, onMove); window.removeEventListener(“mouseup”, onUp); };
window.addEventListener(“mousemove”, onMove); window.addEventListener(“mouseup”, onUp);
};

const progress = Math.min(Math.abs(offsetX) / THRESH, 1);
const snapping = offsetX === 0 || exiting;

return (
<div style={{ position: “relative”, overflow: “hidden” }}>
<div style={{ position: “absolute”, right: 0, top: 0, bottom: 0, width: MAX, background: C.red, display: “flex”, alignItems: “center”, justifyContent: “center”, opacity: progress }}>
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
</div>
<div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown}
style={{ transform: `translateX(${offsetX}px)`, transition: snapping ? “transform 0.28s cubic-bezier(0.25,1,0.5,1)” : “none”, userSelect: “none” }}>
{children}
</div>
</div>
);
};

// ── Voice Input Button ────────────────────────────────────────────────────────
const VoiceInputButton = ({ onResult, size = 40 }) => {
const [listening, setListening] = useState(false);
const recRef = useRef(null);
const toggle = () => {
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { alert(“Voice not supported. Use Safari on iPhone.”); return; }
if (listening) { recRef.current?.stop(); setListening(false); return; }
const r = new SR(); r.lang = “en-US”;
r.onresult = (e) => { onResult(e.results[0][0].transcript); setListening(false); };
r.onerror = () => setListening(false); r.onend = () => setListening(false);
recRef.current = r; r.start(); setListening(true);
};
return (
<button onClick={toggle} style={{ width: size, height: size, borderRadius: 8, border: `1.5px solid ${listening ? C.accent : C.borderL}`, background: listening ? C.accentL : C.s3, display: “flex”, alignItems: “center”, justifyContent: “center”, cursor: “pointer”, flexShrink: 0, transition: “all 0.2s” }}>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x=“9” y=“2” width=“6” height=“13” rx=“3” fill={listening ? C.accent : C.sub}/><path d=“M5 10a7 7 0 0 0 14 0” stroke={listening ? C.accent : C.sub} strokeWidth=“1.5” strokeLinecap=“round” fill=“none”/><line x1=“12” y1=“19” x2=“12” y2=“22” stroke={listening ? C.accent : C.sub} strokeWidth=“1.5” strokeLinecap=“round”/></svg>
</button>
);
};

// ── Main Record Button ────────────────────────────────────────────────────────
const RecordButton = ({ onCapture }) => {
const [state, setState] = useState(“idle”);
const [secs, setSecs] = useState(0);
const timerRef = useRef(null);
const recRef = useRef(null);
const lastText = useRef(””);

const toggle = useCallback(() => {
if (state === “recording”) { recRef.current?.stop(); return; }
if (state === “processing”) return;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) { alert(“Voice not supported. Use Safari on iPhone.”); return; }
lastText.current = “”;
const r = new SR();
r.lang = “en-US”;
r.continuous = false;
r.interimResults = false;
r.maxAlternatives = 1;
r.onstart = () => { setState(“recording”); setSecs(0); timerRef.current = setInterval(() => setSecs(s => s+1), 1000); };
r.onresult = (e) => { lastText.current = e.results[0][0].transcript.trim(); };
r.onend = () => {
clearInterval(timerRef.current);
if (lastText.current) {
setState(“processing”);
onCapture(lastText.current);
setTimeout(() => setState(“idle”), 800);
} else {
setState(“idle”);
}
};
r.onerror = (e) => { console.log(“mic error:”, e.error); clearInterval(timerRef.current); setState(“idle”); };
recRef.current = r;
r.start();
}, [state, onCapture]);

useEffect(() => () => { clearInterval(timerRef.current); recRef.current?.stop(); }, []);

const isRec = state === “recording”; const isProc = state === “processing”;
return (
<div style={{ display: “flex”, flexDirection: “column”, alignItems: “center”, gap: 8, position: “relative” }}>
{isRec && [0,1].map(i => <div key={i} style={{ position: “absolute”, inset: -2, borderRadius: “50%”, background: C.accentG, animation: `pulse-ring 1.2s ease-out ${i*0.4}s infinite` }} />)}
<button onClick={toggle}
style={{ width: 72, height: 72, borderRadius: “50%”, border: “none”, cursor: “pointer”, background: isRec ? C.accent : C.s2, display: “flex”, alignItems: “center”, justifyContent: “center”, boxShadow: isRec ? `0 0 0 4px ${C.accentG}, 0 8px 24px rgba(43,95,140,0.35)` : `0 0 0 1.5px ${C.border}, 0 4px 16px rgba(0,0,0,0.08)`, transition: “all 0.2s”, animation: isRec ? “breath 1.5s ease-in-out infinite” : “none”, outline: “none” }}>
{isProc ? <ProcessingDots color={C.sub} /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x=“9” y=“2” width=“6” height=“13” rx=“3” fill={isRec ? “#fff” : C.text}/><path d=“M5 10a7 7 0 0 0 14 0” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round” fill=“none”/><line x1=“12” y1=“19” x2=“12” y2=“22” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round”/><line x1=“9” y1=“22” x2=“15” y2=“22” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round”/></svg>}
</button>
<span style={{ fontFamily: F, fontSize: 11, color: isRec ? C.accent : C.dim }}>{isRec ? `${secs}s · tap to stop` : isProc ? “processing…” : “tap to speak”}</span>
</div>
);
};

useEffect(() => () => { clearInterval(timerRef.current); recRef.current?.stop(); }, []);

const isRec = state === “recording”; const isProc = state === “processing”;
return (
<div style={{ display: “flex”, flexDirection: “column”, alignItems: “center”, gap: 8, position: “relative” }}>
{isRec && [0,1].map(i => <div key={i} style={{ position: “absolute”, inset: -2, borderRadius: “50%”, background: C.accentG, animation: `pulse-ring 1.2s ease-out ${i*0.4}s infinite` }} />)}
<button onClick={toggle}
style={{ width: 72, height: 72, borderRadius: “50%”, border: “none”, cursor: “pointer”, background: isRec ? C.accent : C.s2, display: “flex”, alignItems: “center”, justifyContent: “center”, boxShadow: isRec ? `0 0 0 4px ${C.accentG}, 0 8px 24px rgba(43,95,140,0.35)` : `0 0 0 1.5px ${C.border}, 0 4px 16px rgba(0,0,0,0.08)`, transition: “all 0.2s”, animation: isRec ? “breath 1.5s ease-in-out infinite” : “none”, outline: “none” }}>
{isProc ? <ProcessingDots color={C.sub} /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x=“9” y=“2” width=“6” height=“13” rx=“3” fill={isRec ? “#fff” : C.text}/><path d=“M5 10a7 7 0 0 0 14 0” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round” fill=“none”/><line x1=“12” y1=“19” x2=“12” y2=“22” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round”/><line x1=“9” y1=“22” x2=“15” y2=“22” stroke={isRec ? “#fff” : C.sub} strokeWidth=“1.5” strokeLinecap=“round”/></svg>}
</button>
<span style={{ fontFamily: F, fontSize: 11, color: isRec ? C.accent : C.dim }}>{isRec ? `${secs}s · tap to stop` : isProc ? “processing…” : “tap to speak”}</span>
</div>
);
};

// ── Bottom Sheet base ─────────────────────────────────────────────────────────
const BottomSheet = ({ onClose, children }) => (

  <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, height: "100dvh", background: "rgba(18,37,58,0.75)", zIndex: 60, display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 0.2s ease", backdropFilter: "blur(4px)" }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: C.s1, borderTop: `1px solid ${C.borderL}`, borderRadius: "16px 16px 0 0", animation: "slideIn 0.25s ease", width: "100%" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "12px auto 0" }} />
      {children}
    </div>
  </div>
);

// ── Text Capture Modal ────────────────────────────────────────────────────────
const TextCaptureModal = ({ onClose, onSubmit }) => {
const [text, setText] = useState(””);
const ref = useRef(null);
useEffect(() => { setTimeout(() => ref.current?.focus(), 150); }, []);
return (
<BottomSheet onClose={onClose}>
<div style={{ padding: “16px 20px 32px” }}>
<div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>What’s on your mind?</div>
<div style={{ display: “flex”, alignItems: “center”, gap: 8, background: C.accentL, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: “8px 12px”, marginBottom: 14 }}>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill={C.accent}/><path d="M5 10a7 7 0 0 0 14 0" stroke={C.accent} strokeWidth="1.5" fill="none"/></svg>
<span style={{ fontFamily: F, fontSize: 12, color: C.accent }}>Tap the <strong>🎤 mic</strong> on your keyboard to speak instead of typing</span>
</div>
<textarea ref={ref} value={text} onChange={e => setText(e.target.value)} placeholder=“What’s on your mind…” rows={4}
style={{ width: “100%”, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 10, padding: “12px 14px”, fontFamily: F, fontSize: 14, color: C.text, resize: “none”, lineHeight: 1.6, marginBottom: 12 }} />
<div style={{ display: “flex”, gap: 8 }}>
<button onClick={onClose} style={{ flex: 1, padding: “12px”, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: F, fontSize: 13, color: C.dim, cursor: “pointer” }}>cancel</button>
<button onClick={() => { if (text.trim()) { onSubmit(text.trim()); onClose(); } }} disabled={!text.trim()}
style={{ flex: 2, padding: “12px”, borderRadius: 10, border: “none”, background: text.trim() ? C.accent : C.s3, fontFamily: F, fontSize: 13, fontWeight: 700, color: text.trim() ? “#fff” : C.dim, cursor: text.trim() ? “pointer” : “default”, transition: “all 0.2s” }}>
capture →
</button>
</div>
</div>
</BottomSheet>
);
};

// ── Edit Capture Modal ────────────────────────────────────────────────────────
const EditCaptureModal = ({ capture, onSave, onClose }) => {
const [text, setText] = useState(capture.text);
const [saving, setSaving] = useState(false);
return (
<BottomSheet onClose={onClose}>
<div style={{ padding: “16px 20px 32px” }}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 14 }}>
<span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Edit capture</span>
<button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: “flex”, alignItems: “center”, justifyContent: “center”, color: C.sub, cursor: “pointer”, fontSize: 14 }}>×</button>
</div>
<textarea value={text} onChange={e => setText(e.target.value)} rows={4}
style={{ width: “100%”, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 10, padding: “12px 14px”, fontFamily: F, fontSize: 14, color: C.text, resize: “none”, lineHeight: 1.6, marginBottom: 12 }} />
<button onClick={async () => { setSaving(true); await onSave(capture.id, text.trim()); onClose(); }} disabled={saving || !text.trim()}
style={{ width: “100%”, padding: “13px”, background: C.accent, border: “none”, borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: “#fff”, cursor: “pointer” }}>
{saving ? “re-analyzing…” : “save & re-analyze →”}
</button>
</div>
</BottomSheet>
);
};

// ── Edit Task Modal ───────────────────────────────────────────────────────────
const EditTaskModal = ({ task, onSave, onClose }) => {
const [edited, setEdited] = useState(task);
const [messages, setMessages] = useState([{ role: “assistant”, text: `What would you like to change? Say things like "rename to…", "set priority to high", "due Friday", or "move to personal".` }]);
const [input, setInput] = useState(””);
const [loading, setLoading] = useState(false);
const bottomRef = useRef(null);
useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: “smooth” }); }, [messages]);

const send = async (msg) => {
const userMsg = msg || input.trim();
if (!userMsg || loading) return;
setInput(””);
setMessages(prev => […prev, { role: “user”, text: userMsg }]);
setLoading(true);
try {
const raw = await askClaude(
`You are ARIA helping edit a task. Current: ${JSON.stringify(edited)}. Respond ONLY with JSON: { "updatedTask": {id,title,cat,priority,due,done}, "reply": "one sentence confirmation" }`,
userMsg
);
const parsed = JSON.parse(raw);
setEdited(parsed.updatedTask);
setMessages(prev => […prev, { role: “assistant”, text: parsed.reply }]);
} catch { setMessages(prev => […prev, { role: “assistant”, text: “Sorry, try again.” }]); }
setLoading(false);
};

return (
<div style={{ position: “fixed”, top: 0, left: “50%”, transform: “translateX(-50%)”, width: “100%”, maxWidth: 430, height: “100dvh”, background: “rgba(18,37,58,0.75)”, zIndex: 70, display: “flex”, flexDirection: “column”, justifyContent: “flex-end”, backdropFilter: “blur(4px)”, animation: “fadeIn 0.2s ease” }}>
<div style={{ background: C.s1, borderTop: `1px solid ${C.borderL}`, borderRadius: “16px 16px 0 0”, display: “flex”, flexDirection: “column”, maxHeight: “88dvh”, animation: “slideIn 0.25s ease” }}>
<div style={{ padding: “12px 20px 12px”, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
<div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: “0 auto 14px” }} />
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 10 }}>
<span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: “0.1em”, textTransform: “uppercase” }}>Editing task</span>
<button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: “flex”, alignItems: “center”, justifyContent: “center”, color: C.sub, cursor: “pointer”, fontSize: 16 }}>×</button>
</div>
<div style={{ background: C.s2, borderRadius: 8, padding: “10px 14px”, border: `1px solid ${C.borderL}` }}>
<div style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{edited.title}</div>
<div style={{ display: “flex”, gap: 10, fontFamily: F, fontSize: 11, color: C.dim }}>
<span style={{ color: PRI[edited.priority], fontWeight: 700 }}>● {edited.priority}</span>
<span>{edited.cat}</span>
<span>Due {edited.due}</span>
</div>
</div>
</div>
<div style={{ flex: 1, overflowY: “auto”, padding: “14px 16px”, display: “flex”, flexDirection: “column”, gap: 10 }}>
{messages.map((m, i) => (
<div key={i} style={{ display: “flex”, justifyContent: m.role === “user” ? “flex-end” : “flex-start” }}>
<div style={{ maxWidth: “80%”, background: m.role === “user” ? C.accent : C.s2, borderRadius: m.role === “user” ? “12px 12px 2px 12px” : “12px 12px 12px 2px”, padding: “8px 12px”, fontFamily: F, fontSize: 13, color: m.role === “user” ? “#fff” : C.text, lineHeight: 1.5 }}>{m.text}</div>
</div>
))}
{loading && <div style={{ display: “flex” }}><div style={{ background: C.s2, borderRadius: “12px 12px 12px 2px”, padding: “10px 14px” }}><ProcessingDots /></div></div>}
<div ref={bottomRef} />
</div>
<div style={{ padding: “10px 16px 12px”, borderTop: `1px solid ${C.border}`, display: “flex”, gap: 8, flexShrink: 0 }}>
<input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === “Enter” && send()} placeholder=‘type or speak a change…’
style={{ flex: 1, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: “10px 12px”, fontFamily: F, fontSize: 13, color: C.text }} />
<VoiceInputButton onResult={(t) => { setInput(t); }} />
<button onClick={() => send()} style={{ background: C.accent, border: “none”, borderRadius: 8, padding: “10px 14px”, fontFamily: F, fontSize: 13, fontWeight: 700, color: “#fff”, cursor: “pointer” }}>send</button>
</div>
<div style={{ padding: “0 16px 28px”, flexShrink: 0 }}>
<button onClick={() => { onSave(edited); onClose(); }} style={{ width: “100%”, padding: “13px”, background: C.green, border: “none”, borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: “#fff”, cursor: “pointer” }}>save changes →</button>
</div>
</div>
</div>
);
};

// ── Edit Upcoming Modal ───────────────────────────────────────────────────────
const EditUpcomingModal = ({ item, onSave, onClose }) => {
const [title, setTitle] = useState(item.title);
const [detail, setDetail] = useState(item.detail);
return (
<BottomSheet onClose={onClose}>
<div style={{ padding: “16px 20px 32px” }}>
<div style={{ display: “flex”, justifyContent: “space-between”, alignItems: “center”, marginBottom: 16 }}>
<span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Edit event</span>
<button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: “flex”, alignItems: “center”, justifyContent: “center”, color: C.sub, cursor: “pointer”, fontSize: 16 }}>×</button>
</div>
<div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: “uppercase”, letterSpacing: “0.08em” }}>Title</div>
<input value={title} onChange={e => setTitle(e.target.value)}
style={{ width: “100%”, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: “10px 12px”, fontFamily: F, fontSize: 14, color: C.text, marginBottom: 12 }} />
<div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: “uppercase”, letterSpacing: “0.08em” }}>When</div>
<input value={detail} onChange={e => setDetail(e.target.value)}
style={{ width: “100%”, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: “10px 12px”, fontFamily: F, fontSize: 14, color: C.text, marginBottom: 16 }} />
<button onClick={() => { onSave({ …item, title, detail }); onClose(); }}
style={{ width: “100%”, padding: “13px”, background: C.accent, border: “none”, borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: “#fff”, cursor: “pointer” }}>
save →
</button>
</div>
</BottomSheet>
);
};

// ── Proposal Card ─────────────────────────────────────────────────────────────
const ProposalCard = ({ p, onApprove, onDismiss }) => (

  <div style={{ margin: "0 16px 12px", borderRadius: 10, background: p.colorL, border: `1px solid ${p.color}22`, borderLeft: `4px solid ${p.color}`, overflow: "hidden" }}>
    <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: F, fontSize: 14, color: p.color }}>{p.icon}</span>
          <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: p.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{p.type}</span>
        </div>
        <span style={{ fontFamily: F, fontSize: 12, fontWeight: 600, color: C.sub }}>{p.time}</span>
      </div>
      <div style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{p.title}</div>
      <div style={{ fontFamily: F, fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{p.body}</div>
    </div>
    <div style={{ display: "flex", borderTop: `1px solid ${p.color}22` }}>
      <button onClick={onDismiss} style={{ flex: 1, padding: "12px", background: C.redL, border: "none", borderRight: `1px solid ${p.color}22`, fontFamily: F, fontSize: 12, fontWeight: 700, color: C.red, cursor: "pointer" }}>✕ dismiss</button>
      <button onClick={onApprove} style={{ flex: 2, padding: "12px", background: "transparent", border: "none", fontFamily: F, fontSize: 12, fontWeight: 700, color: p.color, cursor: "pointer" }}>{p.action} →</button>
    </div>
  </div>
);

// ── Tab: Home ─────────────────────────────────────────────────────────────────
const HomeTab = ({ captures, tasks, proposals, upcoming, onApprove, onDismiss }) => {
const hour = new Date().getHours();
const greeting = hour < 12 ? “Good morning” : hour < 18 ? “Good afternoon” : “Good evening”;
const pendingTasks = tasks.filter(t => !t.done).length;

return (
<div style={{ animation: “fadeUp 0.3s ease” }}>
<div style={{ padding: “20px 20px 16px”, borderBottom: `1px solid ${C.border}` }}>
<div style={{ display: “inline-flex”, alignItems: “center”, gap: 7, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 6, padding: “4px 10px”, marginBottom: 12 }}>
<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={C.accent} strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke={C.accent} strokeWidth="2" strokeLinecap="round"/></svg>
<span style={{ fontFamily: F, fontSize: 12, color: C.sub }}>{new Date().toLocaleDateString(“en-GB”, { weekday: “long”, day: “numeric”, month: “long” })}</span>
</div>
<div style={{ fontFamily: F, fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{greeting}.</div>
<div style={{ fontFamily: F, fontSize: 13, color: C.sub, marginTop: 6 }}>{pendingTasks} tasks open · {proposals.length} proposals waiting</div>
</div>

```
  {/* Stats */}
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: C.border, borderBottom: `1px solid ${C.border}` }}>
    {[
      { label: "Captures", val: captures.length, color: C.text, bg: C.s1, accent: C.sub },
      { label: "Open tasks", val: pendingTasks, color: C.accent, bg: C.accentL, accent: C.accent },
      { label: "Proposals", val: proposals.length, color: C.blue, bg: "rgba(26,122,138,0.07)", accent: C.blue },
    ].map(s => (
      <div key={s.label} style={{ background: s.bg, padding: "16px 0 14px", textAlign: "center", borderTop: `3px solid ${s.accent}` }}>
        <div style={{ fontFamily: F, fontSize: 28, fontWeight: 800, color: s.color }}>{s.val}</div>
        <div style={{ fontFamily: F, fontSize: 10, color: s.accent, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 3, opacity: 0.8 }}>{s.label}</div>
      </div>
    ))}
  </div>

  {/* Top proposal */}
  {proposals[0] && <><SectionLabel label="Latest proposal" /><ProposalCard p={proposals[0]} onDismiss={() => onDismiss(proposals[0].id)} onApprove={() => onApprove(proposals[0])} /></>}

  {/* Open tasks */}
  {tasks.filter(t => !t.done).length > 0 && <>
    <SectionLabel label="Open tasks" />
    {tasks.filter(t => !t.done).slice(0, 3).map((t, i, arr) => (
      <div key={t.id}>
        <div style={{ padding: "12px 20px", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRI[t.priority], flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text }}>{t.title}</div>
            <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 2 }}>{t.cat} · Due {t.due}</div>
          </div>
        </div>
        {i < arr.length - 1 && <Divider />}
      </div>
    ))}
    {tasks.filter(t => !t.done).length > 3 && (
      <div style={{ fontFamily: F, fontSize: 12, color: C.accent, padding: "8px 20px 4px", cursor: "pointer" }}>+{tasks.filter(t => !t.done).length - 3} more tasks →</div>
    )}
  </>}

  {/* Upcoming */}
  {upcoming.length > 0 && <>
    <SectionLabel label="Coming up" />
    {upcoming.slice(0, 2).map((u, i) => (
      <div key={u.id}>
        <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: u.urgency, background: `${u.urgency}18`, padding: "3px 8px", borderRadius: 4, minWidth: 32, textAlign: "center" }}>{u.badge}</div>
          <div>
            <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text }}>{u.title}</div>
            <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 2 }}>{u.detail}</div>
          </div>
        </div>
        {i < 1 && <Divider />}
      </div>
    ))}
  </>}

  {captures.length === 0 && tasks.length === 0 && proposals.length === 0 && (
    <EmptyState icon="👋" text={"Start by tapping the mic button\nor the pencil to drop a note.\nARIA will take it from there."} />
  )}
  <div style={{ height: 20 }} />
</div>
```

);
};

// ── Tab: Captures ─────────────────────────────────────────────────────────────
const CapturesTab = ({ captures, onDelete, onEdit }) => (

  <div style={{ animation: "fadeUp 0.3s ease" }}>
    <SectionLabel label="Captures" count={captures.length} />
    {captures.length === 0
      ? <EmptyState icon="🎙️" text="No captures yet.\nTap the mic to speak or the pencil to write." />
      : captures.map((c, i) => (
        <div key={c.id}>
          <SwipeableRow onDelete={() => onDelete(c.id)}>
            <div style={{ padding: "14px 20px", background: C.s1, display: "flex", gap: 12, alignItems: "flex-start" }}>
              {/* Type badge */}
              <div style={{ flexShrink: 0, marginTop: 2 }}>
                {c.type === "voice"
                  ? <div style={{ background: C.accentL, borderRadius: 6, padding: "4px 6px", display: "flex", alignItems: "center", gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill={C.accent}/><path d="M5 10a7 7 0 0 0 14 0" stroke={C.accent} strokeWidth="2" fill="none"/></svg>
                      <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, color: C.accent, letterSpacing: "0.05em" }}>VOICE</span>
                    </div>
                  : <div style={{ background: C.blueL, borderRadius: 6, padding: "4px 6px", display: "flex", alignItems: "center", gap: 3 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.blue} strokeWidth="2" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.blue} strokeWidth="2" strokeLinecap="round"/></svg>
                      <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: "0.05em" }}>TEXT</span>
                    </div>
                }
              </div>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{c.text}</div>
                <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 4 }}>{c.ago}</div>
              </div>
              {/* Edit */}
              <button onClick={() => onEdit(c)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </SwipeableRow>
          {i < captures.length - 1 && <Divider />}
        </div>
      ))
    }
    <div style={{ fontFamily: F, fontSize: 11, color: C.dim, textAlign: "center", padding: "12px 0", opacity: captures.length ? 1 : 0 }}>← swipe left to delete</div>
    <div style={{ height: 20 }} />
  </div>
);

// ── Tab: Tasks ────────────────────────────────────────────────────────────────
const TasksTab = ({ tasks, setTasks }) => {
const [editingTask, setEditingTask] = useState(null);
const cats = […new Set(tasks.map(t => t.cat))];
const truncate = (str, n = 5) => str.split(” “).length > n ? str.split(” “).slice(0, n).join(” “) + “…” : str;

return (
<div style={{ animation: “fadeUp 0.3s ease” }}>
{tasks.length === 0
? <EmptyState icon="✅" text="No tasks yet.\nApprove a proposal to create one." />
: cats.map(cat => {
const ct = tasks.filter(t => t.cat === cat);
return (
<div key={cat}>
<SectionLabel label={cat} count={`${ct.filter(t=>t.done).length}/${ct.length}`} />
{ct.map((t, i) => (
<div key={t.id}>
<div style={{ padding: “13px 20px”, display: “flex”, gap: 12, alignItems: “center”, background: C.s1, opacity: t.done ? 0.45 : 1, transition: “opacity 0.2s” }}>
<div onClick={() => setTasks(prev => prev.map(p => p.id === t.id ? {…p, done: !p.done} : p))}
style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${t.done ? C.green : C.borderL}`, background: t.done ? C.greenL : “transparent”, display: “flex”, alignItems: “center”, justifyContent: “center”, flexShrink: 0, cursor: “pointer”, transition: “all 0.2s” }}>
{t.done && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
</div>
<div style={{ flex: 1 }}>
<div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text, textDecoration: t.done ? “line-through” : “none” }}>{truncate(t.title)}</div>
<div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 2 }}>{t.cat} · Due {t.due}</div>
</div>
<div style={{ width: 7, height: 7, borderRadius: “50%”, background: PRI[t.priority], flexShrink: 0 }} />
{!t.done && <button onClick={() => setEditingTask(t)} style={{ background: “none”, border: “none”, cursor: “pointer”, padding: “2px” }}>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
</button>}
</div>
{i < ct.length - 1 && <Divider />}
</div>
))}
</div>
);
})
}
<div style={{ height: 20 }} />
{editingTask && <EditTaskModal task={editingTask} onSave={(u) => setTasks(prev => prev.map(t => t.id === u.id ? u : t))} onClose={() => setEditingTask(null)} />}
</div>
);
};

// ── Tab: Proposals ────────────────────────────────────────────────────────────
const ProposalsTab = ({ proposals, onApprove, onDismiss }) => (

  <div style={{ animation: "fadeUp 0.3s ease" }}>
    <SectionLabel label="Waiting for your call" count={proposals.length} />
    {proposals.length === 0
      ? <EmptyState icon="💡" text="No proposals yet.\nCapture a voice note or drop a text note — ARIA will propose next steps." />
      : <div style={{ paddingTop: 8 }}>{proposals.map(p => <ProposalCard key={p.id} p={p} onApprove={() => onApprove(p)} onDismiss={() => onDismiss(p.id)} />)}</div>
    }
    <div style={{ height: 20 }} />
  </div>
);

// ── Tab: Upcoming ─────────────────────────────────────────────────────────────
const UpcomingTab = ({ upcoming, setUpcoming }) => {
const [editingItem, setEditingItem] = useState(null);
return (
<div style={{ animation: “fadeUp 0.3s ease” }}>
<SectionLabel label="On the horizon" count={upcoming.length} />
{upcoming.length === 0
? <EmptyState icon="📅" text="Nothing scheduled yet.\nApprove a calendar proposal to add events here." />
: upcoming.map((u, i) => (
<div key={u.id}>
<SwipeableRow onDelete={() => setUpcoming(prev => prev.filter(x => x.id !== u.id))}>
<div style={{ padding: “14px 20px”, display: “flex”, gap: 14, alignItems: “center”, background: C.s1 }}>
<div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, color: u.urgency, background: `${u.urgency}18`, padding: “5px 9px”, borderRadius: 5, minWidth: 36, textAlign: “center” }}>{u.badge}</div>
<div style={{ flex: 1 }}>
<div style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: C.text }}>{u.title}</div>
<div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 3 }}>{u.detail}</div>
</div>
<button onClick={() => setEditingItem(u)} style={{ background: “none”, border: “none”, cursor: “pointer”, padding: “2px” }}>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
</button>
<div style={{ width: 6, height: 6, borderRadius: “50%”, background: u.urgency }} />
</div>
</SwipeableRow>
{i < upcoming.length - 1 && <Divider />}
</div>
))
}
{upcoming.length > 0 && <div style={{ fontFamily: F, fontSize: 11, color: C.dim, textAlign: “center”, padding: “12px 0” }}>← swipe left to delete</div>}
<div style={{ height: 20 }} />
{editingItem && <EditUpcomingModal item={editingItem} onSave={(u) => setUpcoming(prev => prev.map(x => x.id === u.id ? u : x))} onClose={() => setEditingItem(null)} />}
</div>
);
};

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV = [
{ id: “home”, label: “Home”, icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9M5 10v9h5v-5h4v5h5v-9" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
{ id: “captures”, label: “Captures”, icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="12" r="3" stroke={a?C.accent:C.dim} strokeWidth="1.5"/></svg> },
{ id: “tasks”, label: “Tasks”, icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/><rect x="3" y="3" width="18" height="18" rx="3" stroke={a?C.accent:C.dim} strokeWidth="1.5"/></svg> },
{ id: “proposals”, label: “Proposals”, icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 1 4 12.73V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.27A7 7 0 0 1 12 2z" stroke={a?C.accent:C.dim} strokeWidth="1.5"/><path d="M9 21h6" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg> },
{ id: “upcoming”, label: “Ahead”, icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={a?C.accent:C.dim} strokeWidth="1.5"/><path d="M16 2v4M8 2v4M3 10h18" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg> },
];

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
const [tab, setTab] = useState(“home”);
const [tasks, setTasks] = useState([]);
const [proposals, setProposals] = useState([]);
const [captures, setCaptures] = useState([]);
const [upcoming, setUpcoming] = useState([]);
const [showRecorder, setShowRecorder] = useState(false);
const [showTextCapture, setShowTextCapture] = useState(false);
const [editingCapture, setEditingCapture] = useState(null);

// ── Analyze capture with Claude ──
const analyzeCapture = useCallback(async (captureId, text) => {
try {
const raw = await askClaude(
`You are ARIA. The user captured a note. Analyze it and respond ONLY with JSON (no markdown): { "title": "short action title max 6 words", "body": "one sentence proposal", "type": "task|reminder|calendar|insight", "action": "short button label", "tags": ["tag1"] } Types: task=action needed, reminder=time-based, calendar=event/meeting, insight=idea/reflection`,
text
);
const p = JSON.parse(raw);
const colorMap = {
task: { color: C.accent, colorL: C.accentL, icon: “◎” },
reminder: { color: C.green, colorL: C.greenL, icon: “◉” },
calendar: { color: C.blue, colorL: C.blueL, icon: “◈” },
insight: { color: C.purple, colorL: C.purpleL, icon: “◇” },
};
const s = colorMap[p.type] || colorMap.insight;
setProposals(prev => [{ id: Date.now(), …s, title: p.title, body: p.body, type: p.type, action: p.action, time: “Just now”, sourceId: captureId }, …prev]);
setCaptures(prev => prev.map(c => c.id === captureId ? { …c, tags: p.tags || [] } : c));
} catch { /* silent fail */ }
}, []);

// ── Add capture ──
const addCapture = useCallback(async (text, type) => {
const id = Date.now();
const now = new Date();
const capture = { id, text, type, ago: now.toLocaleTimeString(“en-GB”, { hour: “2-digit”, minute: “2-digit” }), tags: [] };
setCaptures(prev => [capture, …prev]);
setShowRecorder(false);
setShowTextCapture(false);
analyzeCapture(id, text);
}, [analyzeCapture]);

// ── Edit capture & re-analyze ──
const editCapture = useCallback(async (id, newText) => {
setCaptures(prev => prev.map(c => c.id === id ? { …c, text: newText } : c));
setProposals(prev => prev.filter(p => p.sourceId !== id));
await analyzeCapture(id, newText);
}, [analyzeCapture]);

// ── Approve proposal ──
const approveProposal = useCallback((proposal) => {
setProposals(prev => prev.filter(p => p.id !== proposal.id));
if (proposal.type === “calendar”) {
setUpcoming(prev => [{ id: Date.now(), title: proposal.title, detail: “Scheduled”, badge: “Soon”, urgency: C.blue }, …prev]);
setTab(“upcoming”);
} else {
const rawTitle = proposal.title;
setTasks(prev => [{ id: Date.now(), title: rawTitle, cat: proposal.type === “health” ? “Health” : proposal.type === “personal” ? “Personal” : “Work”, priority: “medium”, due: “This week”, done: false }, …prev]);
setTab(“tasks”);
}
}, []);

const dismissProposal = useCallback((id) => setProposals(prev => prev.filter(p => p.id !== id)), []);
const deleteCapture = useCallback((id) => { setCaptures(prev => prev.filter(c => c.id !== id)); setProposals(prev => prev.filter(p => p.sourceId !== id)); }, []);

const propBadge = proposals.length;

return (
<div style={{ fontFamily: F, background: C.bg, height: “100dvh”, display: “flex”, flexDirection: “column”, maxWidth: 430, margin: “0 auto”, position: “relative”, overflow: “hidden” }}>

```
  {/* Status bar */}
  <div style={{ padding: "12px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
    <div style={{ fontFamily: F, fontSize: 12, color: C.dim }}>{new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
    <div style={{ fontFamily: F, fontSize: 14, fontWeight: 800, color: C.accent, letterSpacing: "0.06em" }}>ARIA</div>
    <div style={{ fontFamily: F, fontSize: 12, color: C.dim }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.green, marginRight: 5, verticalAlign: "middle" }} />active</div>
  </div>

  {/* Content */}
  <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
    {tab === "home"      && <HomeTab captures={captures} tasks={tasks} proposals={proposals} upcoming={upcoming} onApprove={approveProposal} onDismiss={dismissProposal} />}
    {tab === "captures"  && <CapturesTab captures={captures} onDelete={deleteCapture} onEdit={setEditingCapture} />}
    {tab === "tasks"     && <TasksTab tasks={tasks} setTasks={setTasks} />}
    {tab === "proposals" && <ProposalsTab proposals={proposals} onApprove={approveProposal} onDismiss={dismissProposal} />}
    {tab === "upcoming"  && <UpcomingTab upcoming={upcoming} setUpcoming={setUpcoming} />}
  </div>

  {/* Text capture FAB */}
  {!showTextCapture && !editingCapture && (
    <button onClick={() => setShowTextCapture(true)} className="btn-press"
      style={{ position: "absolute", bottom: 128, right: 18, width: 44, height: 44, borderRadius: "50%", border: `1px solid ${C.borderL}`, background: C.s1, boxShadow: `0 2px 12px rgba(0,0,0,0.1)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 30, animation: "fab-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.sub} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.sub} strokeWidth="1.5" strokeLinecap="round"/></svg>
    </button>
  )}

  {/* Text capture modal */}
  {showTextCapture && <TextCaptureModal onClose={() => setShowTextCapture(false)} onSubmit={(text) => addCapture(text, "text")} />}

  {/* Edit capture modal */}
  {editingCapture && <EditCaptureModal capture={editingCapture} onSave={editCapture} onClose={() => setEditingCapture(null)} />}

  {/* Bottom nav */}
  <div style={{ background: C.s1, borderTop: `1px solid ${C.border}`, flexShrink: 0, paddingBottom: 28 }}>
    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
      <button onClick={() => setShowTextCapture(true)} className="btn-press"
        style={{ width: 54, height: 54, borderRadius: "50%", border: "none", background: C.accent, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 4px ${C.accentL}, 0 4px 20px rgba(43,95,140,0.35)`, outline: "none" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill="#fff"/><path d="M5 10a7 7 0 0 0 14 0" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/><line x1="12" y1="19" x2="12" y2="22" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="22" x2="15" y2="22" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
    </div>
    <div style={{ display: "flex", justifyContent: "space-around" }}>
      {NAV.map(n => {
        const active = tab === n.id;
        return (
          <button key={n.id} onClick={() => setTab(n.id)} className="btn-press"
            style={{ flex: 1, padding: "4px 0 4px", background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
            {n.id === "proposals" && propBadge > 0 && (
              <div style={{ position: "absolute", top: 0, right: "calc(50% - 20px)", width: 15, height: 15, borderRadius: "50%", background: C.red, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, fontSize: 9, fontWeight: 700, color: "#fff" }}>{propBadge}</div>
            )}
            {n.icon(active)}
            <span style={{ fontFamily: F, fontSize: 9, letterSpacing: "0.06em", color: active ? C.accent : C.dim, textTransform: "uppercase", fontWeight: active ? 700 : 400 }}>{n.label}</span>
          </button>
        );
      })}
    </div>
  </div>
</div>
```

);
}