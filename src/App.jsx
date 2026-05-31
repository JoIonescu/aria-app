import { useState, useRef, useEffect, useCallback } from "react";
import { signInAnon, loadUserData, saveUserData } from "./firebase";

const styleEl = document.createElement("style");
styleEl.textContent = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
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
  bg: "#ECF0F5", s1: "#E2E8EF", s2: "#D6DDE7", s3: "#C8D3DE",
  border: "#B4C2D0", borderL: "#C0CCDA",
  accent: "#2B5F8C", accentL: "rgba(43,95,140,0.15)", accentG: "rgba(43,95,140,0.32)",
  text: "#12253A", sub: "#3A5570", dim: "#7A95A8",
  green: "#2E6B4A", greenL: "rgba(46,107,74,0.14)",
  red: "#7A2E1E", redL: "rgba(122,46,30,0.12)",
  blue: "#1A7A8A", blueL: "rgba(26,122,138,0.14)",
  purple: "#4A3580", purpleL: "rgba(74,53,128,0.14)",
};
const F = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PRI = { high: "#7A2E1E", medium: "#2B5F8C", low: "#7A95A8" };
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks";

// ── Google Calendar helpers ───────────────────────────────────────────────────
const getGoogleAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin,
    response_type: "token",
    scope: GOOGLE_SCOPES,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
};

const createGCalEvent = async (token, title, start, end, isReminder = false) => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = {
      summary: title,
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
      reminders: isReminder
        ? { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] }
        : { useDefault: true },
    };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message || `HTTP ${res.status}` };
    return { success: true, data };
  } catch (e) { return { error: e.message }; }
};

// ── Google Tasks helpers ──────────────────────────────────────────────────────
const createGTask = async (token, title) => {
  try {
    const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
};

const completeGTask = async (token, taskId) => {
  try {
    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
  } catch {}
};

const fetchGTasks = async (token) => {
  try {
    const res = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=100", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return {};
    return res.json();
  } catch { return {}; }
};
const askClaude = async (system, userMsg) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 400, system, messages: [{ role: "user", content: userMsg }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API error: ${data.error?.message || res.status}`);
  return data.content[0].text.replace(/```json|```/g, "").trim();
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
    {text.split("\\n").map((line, i) => (
      <div key={i} style={{ fontFamily: F, fontSize: 14, color: C.dim, lineHeight: 1.8 }}>{line}</div>
    ))}
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
    const onUp = () => { if (offsetX < -THRESH) triggerDelete(); else setOffsetX(0); startX.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  };

  const progress = Math.min(Math.abs(offsetX) / THRESH, 1);
  const snapping = offsetX === 0 || exiting;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: MAX, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", opacity: progress }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown}
        style={{ transform: `translateX(${offsetX}px)`, transition: snapping ? "transform 0.28s cubic-bezier(0.25,1,0.5,1)" : "none", userSelect: "none" }}>
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
    if (!SR) { alert("Voice not supported. Use Safari on iPhone."); return; }
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const r = new SR(); r.lang = "en-US";
    r.onresult = (e) => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    recRef.current = r; r.start(); setListening(true);
  };
  return (
    <button onClick={toggle} style={{ width: size, height: size, borderRadius: 8, border: `1.5px solid ${listening ? C.accent : C.borderL}`, background: listening ? C.accentL : C.s3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill={listening ? C.accent : C.sub}/><path d="M5 10a7 7 0 0 0 14 0" stroke={listening ? C.accent : C.sub} strokeWidth="1.5" strokeLinecap="round" fill="none"/><line x1="12" y1="19" x2="12" y2="22" stroke={listening ? C.accent : C.sub} strokeWidth="1.5" strokeLinecap="round"/></svg>
    </button>
  );
};

// ── Main Record Button ────────────────────────────────────────────────────────
const RecordButton = ({ onCapture }) => {
  const [state, setState] = useState("idle");
  const [secs, setSecs] = useState(0);
  const timerRef = useRef(null);
  const recRef = useRef(null);
  const lastText = useRef("");

  const toggle = useCallback(() => {
    if (state === "recording") { recRef.current?.stop(); return; }
    if (state === "processing") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported. Use Safari on iPhone."); return; }
    lastText.current = "";
    const r = new SR();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onstart = () => { setState("recording"); setSecs(0); timerRef.current = setInterval(() => setSecs(s => s+1), 1000); };
    r.onresult = (e) => { lastText.current = e.results[0][0].transcript.trim(); };
    r.onend = () => {
      clearInterval(timerRef.current);
      if (lastText.current) {
        setState("processing");
        onCapture(lastText.current);
        setTimeout(() => setState("idle"), 800);
      } else {
        setState("idle");
      }
    };
    r.onerror = (e) => { console.log("mic error:", e.error); clearInterval(timerRef.current); setState("idle"); };
    recRef.current = r;
    r.start();
  }, [state, onCapture]);

  useEffect(() => () => { clearInterval(timerRef.current); recRef.current?.stop(); }, []);

  const isRec = state === "recording"; const isProc = state === "processing";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative" }}>
      {isRec && [0,1].map(i => <div key={i} style={{ position: "absolute", inset: -2, borderRadius: "50%", background: C.accentG, animation: `pulse-ring 1.2s ease-out ${i*0.4}s infinite` }} />)}
      <button onClick={toggle}
        style={{ width: 72, height: 72, borderRadius: "50%", border: "none", cursor: "pointer", background: isRec ? C.accent : C.s2, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isRec ? `0 0 0 4px ${C.accentG}, 0 8px 24px rgba(43,95,140,0.35)` : `0 0 0 1.5px ${C.border}, 0 4px 16px rgba(0,0,0,0.08)`, transition: "all 0.2s", animation: isRec ? "breath 1.5s ease-in-out infinite" : "none", outline: "none" }}>
        {isProc ? <ProcessingDots color={C.sub} /> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill={isRec ? "#fff" : C.text}/><path d="M5 10a7 7 0 0 0 14 0" stroke={isRec ? "#fff" : C.sub} strokeWidth="1.5" strokeLinecap="round" fill="none"/><line x1="12" y1="19" x2="12" y2="22" stroke={isRec ? "#fff" : C.sub} strokeWidth="1.5" strokeLinecap="round"/><line x1="9" y1="22" x2="15" y2="22" stroke={isRec ? "#fff" : C.sub} strokeWidth="1.5" strokeLinecap="round"/></svg>}
      </button>
      <span style={{ fontFamily: F, fontSize: 11, color: isRec ? C.accent : C.dim }}>{isRec ? `${secs}s · tap to stop` : isProc ? "processing…" : "tap to speak"}</span>
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
const TextCaptureModal = ({ onClose, onSubmit, onSaveNote }) => {
  const [text, setText] = useState("");
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 150); }, []);
  const hasText = text.trim().length > 0;
  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: "16px 20px 32px" }}>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>What's on your mind?</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.accentL, border: `1px solid ${C.accent}33`, borderRadius: 8, padding: "8px 12px", marginBottom: 14 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="13" rx="3" fill={C.accent}/><path d="M5 10a7 7 0 0 0 14 0" stroke={C.accent} strokeWidth="1.5" fill="none"/></svg>
          <span style={{ fontFamily: F, fontSize: 12, color: C.accent }}>Tap the <strong>🎤 mic</strong> on your keyboard to speak instead of typing</span>
        </div>
        <textarea ref={ref} value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind…" rows={4}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 10, padding: "12px 14px", fontFamily: F, fontSize: 14, color: C.text, resize: "none", lineHeight: 1.6, marginBottom: 12 }} />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: F, fontSize: 13, color: C.dim, cursor: "pointer" }}>cancel</button>
          <button onClick={() => { if (hasText) { onSubmit(text.trim()); onClose(); } }} disabled={!hasText}
            style={{ flex: 2, padding: "12px", borderRadius: 10, border: "none", background: hasText ? C.accent : C.s3, fontFamily: F, fontSize: 13, fontWeight: 700, color: hasText ? "#fff" : C.dim, cursor: hasText ? "pointer" : "default", transition: "all 0.2s" }}>
            capture →
          </button>
        </div>
        <button onClick={() => { if (hasText) { onSaveNote(text.trim()); onClose(); } }} disabled={!hasText}
          style={{ width: "100%", padding: "11px", borderRadius: 10, border: `1.5px solid ${hasText ? C.borderL : C.border}`, background: "transparent", fontFamily: F, fontSize: 13, fontWeight: 600, color: hasText ? C.sub : C.dim, cursor: hasText ? "pointer" : "default", transition: "all 0.2s" }}>
          📝 save as note
        </button>
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
      <div style={{ padding: "16px 20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Edit capture</span>
          <button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, cursor: "pointer", fontSize: 14 }}>×</button>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 10, padding: "12px 14px", fontFamily: F, fontSize: 14, color: C.text, resize: "none", lineHeight: 1.6, marginBottom: 12 }} />
        <button onClick={async () => { setSaving(true); await onSave(capture.id, text.trim()); onClose(); }} disabled={saving || !text.trim()}
          style={{ width: "100%", padding: "13px", background: C.accent, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
          {saving ? "re-analyzing…" : "save & re-analyze →"}
        </button>
      </div>
    </BottomSheet>
  );
};

// ── Edit Task Modal ───────────────────────────────────────────────────────────
const EditTaskModal = ({ task, onSave, onClose }) => {
  const [edited, setEdited] = useState(task);
  const [messages, setMessages] = useState([{ role: "assistant", text: `What would you like to change? Say things like "rename to…", "set priority to high", "due Friday", or "move to personal".` }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (msg) => {
    const userMsg = msg || input.trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const raw = await askClaude(
        `You are ARIA helping edit a task. Current: ${JSON.stringify(edited)}. Respond ONLY with JSON: { "updatedTask": {id,title,cat,priority,due,done}, "reply": "one sentence confirmation", "setReminder": true/false }
Set setReminder to true if the user is asking to set a reminder or alert for this task.`,
        userMsg
      );
      const parsed = JSON.parse(raw);
      setEdited(parsed.updatedTask);
      setMessages(prev => [...prev, { role: "assistant", text: parsed.reply }]);
      // If reminder requested, open Shortcut
      if (parsed.setReminder) {
        setTimeout(() => {
          const title = encodeURIComponent(parsed.updatedTask.title.trim());
          window.location.href = `shortcuts://run-shortcut?name=ARIA%20Reminder&input=text&text=${title}`;
        }, 800);
      }
    } catch { setMessages(prev => [...prev, { role: "assistant", text: "Sorry, try again." }]); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, height: "100dvh", background: "rgba(18,37,58,0.75)", zIndex: 70, display: "flex", flexDirection: "column", justifyContent: "flex-end", backdropFilter: "blur(4px)", animation: "fadeIn 0.2s ease" }}>
      <div style={{ background: C.s1, borderTop: `1px solid ${C.borderL}`, borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column", maxHeight: "88dvh", animation: "slideIn 0.25s ease" }}>
        <div style={{ padding: "12px 20px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 14px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>Editing task</span>
            <button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <div style={{ background: C.s2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.borderL}` }}>
            <div style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>{edited.title}</div>
            <div style={{ display: "flex", gap: 10, fontFamily: F, fontSize: 11, color: C.dim }}>
              <span style={{ color: PRI[edited.priority], fontWeight: 700 }}>● {edited.priority}</span>
              <span>{edited.cat}</span>
              <span>Due {edited.due}</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "80%", background: m.role === "user" ? C.accent : C.s2, borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", padding: "8px 12px", fontFamily: F, fontSize: 13, color: m.role === "user" ? "#fff" : C.text, lineHeight: 1.5 }}>{m.text}</div>
            </div>
          ))}
          {loading && <div style={{ display: "flex" }}><div style={{ background: C.s2, borderRadius: "12px 12px 12px 2px", padding: "10px 14px" }}><ProcessingDots /></div></div>}
          <div ref={bottomRef} />
        </div>
        <div style={{ padding: "10px 16px 12px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexShrink: 0 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder='type or speak a change…'
            style={{ flex: 1, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, fontSize: 13, color: C.text }} />
          <VoiceInputButton onResult={(t) => { setInput(t); }} />
          <button onClick={() => send()} style={{ background: C.accent, border: "none", borderRadius: 8, padding: "10px 14px", fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>send</button>
        </div>
        <div style={{ padding: "0 16px 28px", flexShrink: 0 }}>
          <button onClick={() => { onSave(edited); onClose(); }} style={{ width: "100%", padding: "13px", background: C.green, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>save changes →</button>
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
      <div style={{ padding: "16px 20px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Edit event</span>
          <button onClick={onClose} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Title</div>
        <input value={title} onChange={e => setTitle(e.target.value)}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, fontSize: 14, color: C.text, marginBottom: 12 }} />
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>When</div>
        <input value={detail} onChange={e => setDetail(e.target.value)}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, fontSize: 14, color: C.text, marginBottom: 16 }} />
        <button onClick={() => { onSave({ ...item, title, detail }); onClose(); }}
          style={{ width: "100%", padding: "13px", background: C.accent, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
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

// ── Create Google Calendar Reminder Modal ─────────────────────────────────────
const CreateReminderModal = ({ proposal, googleToken, onClose, onCreated }) => {
  const def = new Date(); def.setHours(def.getHours() + 1, 0, 0, 0);
  const fmt = (d) => d.toISOString().slice(0, 16);
  const [when, setWhen] = useState(fmt(def));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setLoading(true); setError("");
    const start = new Date(when).toISOString();
    const end = new Date(new Date(when).getTime() + 30 * 60 * 1000).toISOString();
    const result = await createGCalEvent(googleToken, proposal.title, start, end, true);
    if (result.error) {
      if (result.error.includes("401") || result.error.toLowerCase().includes("credentials") || result.error.toLowerCase().includes("authentication")) {
        save("aria_google_token", null);
        save("aria_pending_reminder", proposal);
        window.location.href = getGoogleAuthUrl();
        return;
      }
      setError(`Could not set reminder: ${result.error}`);
      setLoading(false); return;
    }
    onCreated();
    onClose();
    setLoading(false);
  };

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: "16px 20px 32px" }}>
        <div style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Set Reminder</div>
        <div style={{ fontFamily: F, fontSize: 13, color: C.sub, marginBottom: 4 }}>{proposal.title}</div>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 16 }}>You'll get a Google Calendar notification at this time.</div>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>When?</div>
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, color: C.text, marginBottom: 16 }} />
        {error && <div style={{ fontFamily: F, fontSize: 12, color: C.red, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}
        <button onClick={create} disabled={loading}
          style={{ width: "100%", padding: "13px", background: loading ? C.s3 : C.green, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: loading ? "default" : "pointer" }}>
          {loading ? "Setting reminder…" : "Set reminder →"}
        </button>
      </div>
    </BottomSheet>
  );
};

// ── Create Google Calendar Event Modal ───────────────────────────────────────
const CreateEventModal = ({ proposal, googleToken, onClose, onCreated }) => {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow); tomorrowEnd.setHours(10, 0, 0, 0);
  const fmt = (d) => d.toISOString().slice(0, 16);
  const [start, setStart] = useState(fmt(tomorrow));
  const [end, setEnd] = useState(fmt(tomorrowEnd));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setLoading(true); setError("");
    const result = await createGCalEvent(googleToken, proposal.title, new Date(start).toISOString(), new Date(end).toISOString());
    if (result.error) {
      if (result.error.includes("401") || result.error.toLowerCase().includes("credentials") || result.error.toLowerCase().includes("authentication")) {
        save("aria_google_token", null);
        save("aria_pending_calendar", proposal);
        window.location.href = getGoogleAuthUrl();
        return;
      }
      setError(`Could not create event: ${result.error}`);
      setLoading(false); return;
    }
    onCreated();
    onClose();
    setLoading(false);
  };

  return (
    <BottomSheet onClose={onClose}>
      <div style={{ padding: "16px 20px 32px" }}>
        <div style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 4 }}>Add to Google Calendar</div>
        <div style={{ fontFamily: F, fontSize: 13, color: C.sub, marginBottom: 16 }}>{proposal.title}</div>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Start</div>
        <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, color: C.text, marginBottom: 12 }} />
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>End</div>
        <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
          style={{ width: "100%", background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 8, padding: "10px 12px", fontFamily: F, color: C.text, marginBottom: 16 }} />
        {error && <div style={{ fontFamily: F, fontSize: 12, color: C.red, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}
        <button onClick={create} disabled={loading}
          style={{ width: "100%", padding: "13px", background: loading ? C.s3 : C.accent, border: "none", borderRadius: 10, fontFamily: F, fontSize: 13, fontWeight: 700, color: "#fff", cursor: loading ? "default" : "pointer" }}>
          {loading ? "Creating…" : "Add to Google Calendar →"}
        </button>
      </div>
    </BottomSheet>
  );
};

// ── Completion Banner ─────────────────────────────────────────────────────────
const CompletionBanner = ({ items, onDone, onSnooze }) => {
  if (!items.length) return null;
  return (
    <div style={{ margin: "12px 16px 0", borderRadius: 12, background: C.greenL, border: `1px solid ${C.green}33`, borderLeft: `4px solid ${C.green}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 8px" }}>
        <div style={{ fontFamily: F, fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>⏰ Did these happen?</div>
        {items.map(item => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
            <span style={{ fontFamily: F, fontSize: 13, color: C.text, flex: 1 }}>{item.title}</span>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => onSnooze(item.id)}
                style={{ padding: "4px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: F, fontSize: 11, color: C.dim, cursor: "pointer" }}>
                not yet
              </button>
              <button onClick={() => onDone(item.id)}
                style={{ padding: "4px 10px", background: C.green, border: "none", borderRadius: 6, fontFamily: F, fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                done ✓
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
const HomeTab = ({ captures, tasks, proposals, upcoming, notes, onApprove, onDismiss, completionItems, onDone, onSnooze }) => {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const pendingTasks = tasks.filter(t => !t.done).length;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 6, padding: "4px 10px", marginBottom: 12 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={C.accent} strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke={C.accent} strokeWidth="2" strokeLinecap="round"/></svg>
          <span style={{ fontFamily: F, fontSize: 12, color: C.sub }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <div style={{ fontFamily: F, fontSize: 28, fontWeight: 800, color: C.text, lineHeight: 1.15 }}>{greeting}.</div>
        <div style={{ fontFamily: F, fontSize: 13, color: C.sub, marginTop: 6 }}>{pendingTasks} tasks open · {proposals.length} proposals waiting</div>
      </div>

      <CompletionBanner items={completionItems || []} onDone={onDone} onSnooze={onSnooze} />

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

      {/* Notes preview */}
      {notes && notes.length > 0 && <>
        <SectionLabel label="Recent notes" count={notes.length} />
        {notes.slice(0, 2).map((n, i) => (
          <div key={n.id}>
            <div style={{ padding: "12px 20px", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>📝</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F, fontSize: 13, color: C.text, lineHeight: 1.5 }}>{n.text.length > 80 ? n.text.slice(0, 80) + "…" : n.text}</div>
                <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 2 }}>{n.ago}</div>
              </div>
            </div>
            {i < Math.min(notes.length, 2) - 1 && <Divider />}
          </div>
        ))}
        {notes.length > 2 && <div style={{ fontFamily: F, fontSize: 12, color: C.accent, padding: "6px 20px 4px" }}>+{notes.length - 2} more notes →</div>}
      </>}

      {captures.length === 0 && tasks.length === 0 && proposals.length === 0 && (
        <EmptyState icon="👋" text={"Start by tapping the mic button\nor the pencil to drop a note.\nARIA will take it from there."} />
      )}
      <div style={{ height: 20 }} />
    </div>
  );
};

// ── Tab: Captures ─────────────────────────────────────────────────────────────
// ── Note Card ─────────────────────────────────────────────────────────────────
const NoteCard = ({ note, onDelete, onSendToARIA }) => (
  <SwipeableRow onDelete={() => onDelete(note.id)}>
    <div style={{ padding: "14px 20px", background: C.s1, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <div style={{ background: "rgba(74,53,128,0.12)", borderRadius: 6, padding: "4px 6px", display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 10 }}>📝</span>
          <span style={{ fontFamily: F, fontSize: 9, fontWeight: 700, color: C.purple, letterSpacing: "0.05em" }}>NOTE</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: F, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{note.text}</div>
        <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 4 }}>{note.ago}</div>
      </div>
      <button onClick={() => onSendToARIA(note)}
        style={{ background: C.purpleL, border: `1px solid ${C.purple}33`, borderRadius: 8, padding: "6px 10px", fontFamily: F, fontSize: 11, fontWeight: 700, color: C.purple, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
        Send →
      </button>
    </div>
  </SwipeableRow>
);

const CapturesTab = ({ captures, notes, onDelete, onEdit, onDeleteNote, onSendNoteToARIA }) => (
  <div style={{ animation: "fadeUp 0.3s ease" }}>
    <SectionLabel label="Captures" count={captures.length} />
    {captures.length === 0
      ? <EmptyState icon="🎙️" text="No captures yet.\nTap the mic to speak or the pencil to write." />
      : captures.map((c, i) => (
        <div key={c.id}>
          <SwipeableRow onDelete={() => onDelete(c.id)}>
            <div style={{ padding: "14px 20px", background: C.s1, display: "flex", gap: 12, alignItems: "flex-start" }}>
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
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F, fontSize: 14, color: C.text, lineHeight: 1.6 }}>{c.text}</div>
                <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 4 }}>{c.ago}</div>
              </div>
              <button onClick={() => onEdit(c)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
          </SwipeableRow>
          {i < captures.length - 1 && <Divider />}
        </div>
      ))
    }
    {notes.length > 0 && <>
      <SectionLabel label="Notes" count={notes.length} />
      {notes.map((n, i) => (
        <div key={n.id}>
          <NoteCard note={n} onDelete={onDeleteNote} onSendToARIA={onSendNoteToARIA} />
          {i < notes.length - 1 && <Divider />}
        </div>
      ))}
    </>}
    <div style={{ fontFamily: F, fontSize: 11, color: C.dim, textAlign: "center", padding: "12px 0", opacity: (captures.length + notes.length) ? 1 : 0 }}>← swipe left to delete</div>
    <div style={{ height: 20 }} />
  </div>
);

// ── Tab: Tasks ────────────────────────────────────────────────────────────────
const TasksTab = ({ tasks, setTasks, setUpcoming }) => {
  const [editingTask, setEditingTask] = useState(null);
  const cats = [...new Set(tasks.map(t => t.cat))];
  const truncate = (str, n = 5) => str.split(" ").length > n ? str.split(" ").slice(0, n).join(" ") + "…" : str;

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      {tasks.length === 0
        ? <EmptyState icon="✅" text="No tasks yet.\nApprove a proposal to create one." />
        : cats.map(cat => {
            const ct = tasks.filter(t => t.cat === cat);
            return (
              <div key={cat}>
                <SectionLabel label={cat} count={`${ct.filter(t=>t.done).length}/${ct.length}`} />
                {ct.map((t, i) => (
                  <div key={t.id}>
                    <SwipeableRow onDelete={() => { setTasks(prev => prev.filter(p => p.id !== t.id)); setUpcoming(prev => prev.filter(u => u.id !== t.id)); }}>
                      <div style={{ padding: "13px 20px", display: "flex", gap: 12, alignItems: "center", background: C.s1, opacity: t.done ? 0.45 : 1, transition: "opacity 0.2s" }}>
                        <div onClick={() => {
                          const becomingDone = !t.done;
                          setTasks(prev => prev.map(p => p.id === t.id ? {...p, done: becomingDone} : p));
                          if (becomingDone) {
                            // Completing → remove from Ahead
                            setUpcoming(prev => prev.filter(u => u.id !== t.id));
                          } else {
                            // Unchecking → restore to Ahead if it was a reminder/calendar task
                            if (t.isReminder) {
                              setUpcoming(prev => [...prev, { id: t.id, title: t.title, detail: "Reminder", badge: "⏰", urgency: C.green, isReminder: true, createdAt: t.createdAt || Date.now() }]);
                            } else if (t.isCalendar) {
                              setUpcoming(prev => [...prev, { id: t.id, title: t.title, detail: "Calendar event", badge: "📅", urgency: C.blue }]);
                            }
                          }
                          const tok = load("aria_google_token", null);
                          if (tok && t.gTaskId && becomingDone) completeGTask(tok, t.gTaskId).catch(() => {});
                        }}
                          style={{ width: 20, height: 20, borderRadius: 5, border: `1.5px solid ${t.done ? C.green : C.borderL}`, background: t.done ? C.greenL : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all 0.2s" }}>
                          {t.done && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4l2.5 2.5L9 1" stroke={C.green} strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.text, textDecoration: t.done ? "line-through" : "none" }}>{truncate(t.title)}</div>
                          <div style={{ fontFamily: F, fontSize: 11, color: C.dim, marginTop: 2 }}>{t.cat} · Due {t.due}</div>
                        </div>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: PRI[t.priority], flexShrink: 0 }} />
                        {!t.done && <button onClick={() => setEditingTask(t)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>}
                      </div>
                    </SwipeableRow>
                    {i < ct.length - 1 && <Divider />}
                  </div>
                ))}
              </div>
            );
          })
      }
      <div style={{ height: 20 }} />
      {editingTask && <EditTaskModal task={editingTask} onSave={(u) => {
        setTasks(prev => prev.map(t => t.id === u.id ? u : t));
        setUpcoming(prev => prev.map(up => up.id === u.id ? { ...up, title: u.title } : up));
      }} onClose={() => setEditingTask(null)} />}
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
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <SectionLabel label="On the horizon" count={upcoming.length} />
      {upcoming.length === 0
        ? <EmptyState icon="📅" text="Nothing scheduled yet.\nApprove a calendar proposal to add events here." />
        : upcoming.map((u, i) => {
          const isOverdue = u.isReminder && u.createdAt && (Date.now() - u.createdAt) > 24 * 60 * 60 * 1000;
          const color = isOverdue ? C.red : u.urgency;
          return (
          <div key={u.id}>
            <SwipeableRow onDelete={() => setUpcoming(prev => prev.filter(x => x.id !== u.id))}>
              <div style={{ padding: "14px 20px", display: "flex", gap: 14, alignItems: "center", background: C.s1 }}>
                <div style={{ fontFamily: F, fontSize: 12, fontWeight: 700, color, background: `${color}18`, padding: "5px 9px", borderRadius: 5, minWidth: 36, textAlign: "center" }}>
                  {isOverdue ? "late" : u.badge}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: C.text }}>{u.title}</div>
                  <div style={{ fontFamily: F, fontSize: 11, color: isOverdue ? C.red : C.dim, marginTop: 3 }}>{isOverdue ? "Overdue" : u.detail}</div>
                </div>
                <button onClick={() => setEditingItem(u)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
              </div>
            </SwipeableRow>
            {i < upcoming.length - 1 && <Divider />}
          </div>
          );
        })
      }
      {upcoming.length > 0 && <div style={{ fontFamily: F, fontSize: 11, color: C.dim, textAlign: "center", padding: "12px 0" }}>← swipe left to delete</div>}
      <div style={{ height: 20 }} />
      {editingItem && <EditUpcomingModal item={editingItem} onSave={(u) => setUpcoming(prev => prev.map(x => x.id === u.id ? u : x))} onClose={() => setEditingItem(null)} />}
    </div>
  );
};

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "home", label: "Home", icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12L12 3l9 9M5 10v9h5v-5h4v5h5v-9" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: "captures", label: "Captures", icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="12" r="3" stroke={a?C.accent:C.dim} strokeWidth="1.5"/></svg> },
  { id: "tasks", label: "Tasks", icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/><rect x="3" y="3" width="18" height="18" rx="3" stroke={a?C.accent:C.dim} strokeWidth="1.5"/></svg> },
  { id: "proposals", label: "Proposals", icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 0 1 4 12.73V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.27A7 7 0 0 1 12 2z" stroke={a?C.accent:C.dim} strokeWidth="1.5"/><path d="M9 21h6" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { id: "upcoming", label: "Ahead", icon: a => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke={a?C.accent:C.dim} strokeWidth="1.5"/><path d="M16 2v4M8 2v4M3 10h18" stroke={a?C.accent:C.dim} strokeWidth="1.5" strokeLinecap="round"/></svg> },
];

// ── Root App ──────────────────────────────────────────────────────────────────
const load = (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

export default function App() {
  const [tab, setTab] = useState("home");
  const [tasks, setTasksRaw] = useState(() => load("aria_tasks", []));
  const [proposals, setProposalsRaw] = useState(() => load("aria_proposals", []));
  const [captures, setCapturesRaw] = useState(() => load("aria_captures", []));
  const [upcoming, setUpcomingRaw] = useState(() => load("aria_upcoming", []));
  const [snoozed, setSnoozedRaw] = useState(() => load("aria_snoozed", []));
  const [notes, setNotesRaw] = useState(() => load("aria_notes", []));
  const [userId, setUserId] = useState(null);
  const saveTimer = useRef(null);
  const [googleToken, setGoogleToken] = useState(() => load("aria_google_token", null));
  const clearGoogleToken = useCallback(() => { save("aria_google_token", null); setGoogleToken(null); }, []);

  // Sign in anonymously and load data from Firestore
  useEffect(() => {
    signInAnon().then(({ user }) => {
      setUserId(user.uid);
      loadUserData(user.uid).then(data => {
        if (data) {
          // Firestore has data — use it (overrides localStorage)
          if (data.tasks) setTasksRaw(data.tasks);
          if (data.captures) setCapturesRaw(data.captures);
          if (data.proposals) setProposalsRaw(data.proposals);
          if (data.upcoming) setUpcomingRaw(data.upcoming);
          if (data.snoozed) setSnoozedRaw(data.snoozed);
          if (data.notes) setNotesRaw(data.notes);
        } else {
          // No Firestore data — migrate from localStorage
          const localData = {
            tasks: load("aria_tasks", []),
            captures: load("aria_captures", []),
            proposals: load("aria_proposals", []),
            upcoming: load("aria_upcoming", []),
            snoozed: load("aria_snoozed", []),
            notes: load("aria_notes", []),
          };
          saveUserData(user.uid, localData);
        }
      });
    }).catch(() => {});
  }, []);

  // Debounced save to Firestore on any state change
  useEffect(() => {
    if (!userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveUserData(userId, { tasks, captures, proposals, upcoming, snoozed, notes });
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [tasks, captures, proposals, upcoming, snoozed, notes, userId]);
  const [calendarProposal, setCalendarProposal] = useState(null);
  const [reminderProposal, setReminderProposal] = useState(null);
  const [showRecorder, setShowRecorder] = useState(false);

  // Detect Google OAuth token on redirect back
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token=")) {
      const params = new URLSearchParams(hash.replace("#", "?"));
      const token = params.get("access_token");
      if (token) {
        save("aria_google_token", token);
        setGoogleToken(token);
        window.history.replaceState(null, "", window.location.pathname);
        // Restore pending calendar or reminder proposal
        const pendingCal = load("aria_pending_calendar", null);
        if (pendingCal) { setCalendarProposal(pendingCal); save("aria_pending_calendar", null); }
        const pendingRem = load("aria_pending_reminder", null);
        if (pendingRem) { setReminderProposal(pendingRem); save("aria_pending_reminder", null); }
      }
    }
  }, []);
  const [showTextCapture, setShowTextCapture] = useState(false);
  const [editingCapture, setEditingCapture] = useState(null);

  const setTasks = useCallback((v) => { setTasksRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_tasks", n); return n; }); }, []);
  const setProposals = useCallback((v) => { setProposalsRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_proposals", n); return n; }); }, []);
  const setCaptures = useCallback((v) => { setCapturesRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_captures", n); return n; }); }, []);
  const setUpcoming = useCallback((v) => { setUpcomingRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_upcoming", n); return n; }); }, []);
  const setSnoozed = useCallback((v) => { setSnoozedRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_snoozed", n); return n; }); }, []);
  const setNotes = useCallback((v) => { setNotesRaw(p => { const n = typeof v === "function" ? v(p) : v; save("aria_notes", n); return n; }); }, []);

  // Sync Google Tasks on load — fetch completed tasks and mark done in ARIA
  useEffect(() => {
    if (!googleToken) return;
    fetchGTasks(googleToken).then(data => {
      if (!data.items) return;
      setTasks(prev => {
        const existingGIds = new Set(prev.map(t => t.gTaskId).filter(Boolean));
        // Add new tasks from Google
        const newFromGoogle = data.items
          .filter(gt => !existingGIds.has(gt.id))
          .map(gt => ({ id: Date.now() + Math.random(), title: gt.title, cat: "Work", priority: "medium", due: gt.due ? new Date(gt.due).toLocaleDateString() : "This week", done: false, gTaskId: gt.id }));
        return newFromGoogle.length ? [...newFromGoogle, ...prev] : prev;
      });
    }).catch(() => {});

    // Separately fetch completed tasks and mark done in ARIA
    fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100", {
      headers: { "Authorization": `Bearer ${googleToken}` },
    }).then(r => r.ok ? r.json() : {}).then(data => {
      if (!data.items) return;
      const completedGIds = new Set(
        data.items.filter(t => t.status === "completed").map(t => t.id)
      );
      if (completedGIds.size === 0) return;
      setTasks(prev => prev.map(t =>
        t.gTaskId && completedGIds.has(t.gTaskId) && !t.done
          ? { ...t, done: true }
          : t
      ));
    }).catch(() => {});
  }, [googleToken]);

  const getBannerSessionKey = (id) => {
    const h = new Date().getHours();
    const period = h < 12 ? "morning" : "evening";
    return `${new Date().toDateString()}_${period}_${id}`;
  };

  const completionItems = (upcoming || []).filter(u => {
    if (!u || (!u.isReminder && !u.isCalendar) || !u.createdAt) return false;
    const now = Date.now();
    const age = now - u.createdAt;
    const sessionKey = getBannerSessionKey(u.id);
    const shownThisSession = load(`aria_banner_${u.id}`, "");
    if (shownThisSession === sessionKey) return false; // already shown this session
    const creationDay = new Date(u.createdAt).toDateString();
    const today = new Date().toDateString();
    if (creationDay === today) return age >= 60 * 60 * 1000; // day 1: show after 1h
    const h = new Date().getHours();
    return (h >= 6 && h < 12) || (h >= 17 && h < 22); // other days: morning or evening
  });

  const handleDone = useCallback((id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true } : t));
    setUpcoming(prev => prev.filter(u => u.id !== id));
    setSnoozed(prev => prev.filter(s => s !== id));
  }, [setTasks, setUpcoming, setSnoozed]);

  const handleSnooze = useCallback((id) => {
    const sessionKey = getBannerSessionKey(id);
    save(`aria_banner_${id}`, sessionKey);
    setSnoozed(prev => [...prev, id]);
    setTimeout(() => setSnoozed(prev => prev.filter(s => s !== id)), 100);
  }, [setSnoozed]);

  // ── Analyze capture with Claude ──
  const analyzeCapture = useCallback(async (captureId, text) => {
    try {
      const raw = await askClaude(
        `You are ARIA. Analyze this note and respond ONLY with JSON (no markdown):
{
  "title": "short action title max 6 words",
  "body": "one sentence proposal",
  "type": "task|reminder|calendar|insight",
  "action": "short button label",
  "tags": ["tag1"],
  "due": "extracted date/time plain English or null",
  "directAction": false,
  "priority": "high|medium|low",
  "cat": "Work|Personal|Health"
}
IMPORTANT: directAction must be false for task and insight — user always reviews those in proposals.
directAction true ONLY when type is reminder (clear time mentioned) or calendar (clear event and time).
Types: task=action needed, reminder=time alert, calendar=event/meeting, insight=idea.`,
        text
      );
      const p = JSON.parse(raw);
      const colorMap = {
        task: { color: C.accent, colorL: C.accentL, icon: "◎" },
        reminder: { color: C.green, colorL: C.greenL, icon: "◉" },
        calendar: { color: C.blue, colorL: C.blueL, icon: "◈" },
        insight: { color: C.purple, colorL: C.purpleL, icon: "◇" },
      };
      const s = colorMap[p.type] || colorMap.insight;
      setCaptures(prev => prev.map(c => c.id === captureId ? { ...c, tags: p.tags || [] } : c));

      if (p.directAction && p.type === "task") {
        const id = Date.now();
        const newTask = { id, title: p.title, cat: p.cat || "Work", priority: p.priority || "medium", due: p.due || "This week", done: false, sourceId: captureId };
        setTasks(prev => [newTask, ...prev]);
        const tok = load("aria_google_token", null);
        if (tok) createGTask(tok, p.title).then(gt => { if (gt.id) setTasks(prev => prev.map(t => t.id === id ? { ...t, gTaskId: gt.id } : t)); }).catch(() => {});
      } else if (p.directAction && p.type === "reminder") {
        setReminderProposal({ id: Date.now(), title: p.title, type: "reminder", sourceId: captureId });
      } else if (p.directAction && p.type === "calendar") {
        setCalendarProposal({ id: Date.now(), title: p.title, type: "calendar", sourceId: captureId });
      } else {
        setProposals(prev => [{ id: Date.now(), ...s, title: p.title, body: p.body, type: p.type, action: p.action, due: p.due || null, time: "Just now", sourceId: captureId }, ...prev]);
      }
    } catch (err) { console.error("analyzeCapture error:", err); }
  }, []);

  // ── Add capture ──
  const addCapture = useCallback(async (text, type) => {
    const id = Date.now();
    const now = new Date();
    const capture = { id, text, type, ago: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), tags: [] };
    setCaptures(prev => [capture, ...prev]);
    setShowRecorder(false);
    setShowTextCapture(false);
    analyzeCapture(id, text);
  }, [analyzeCapture]);

  // ── Edit capture & re-analyze ──
  const editCapture = useCallback(async (id, newText) => {
    setCaptures(prev => prev.map(c => c.id === id ? { ...c, text: newText } : c));
    setProposals(prev => prev.filter(p => p.sourceId !== id));
    await analyzeCapture(id, newText);
  }, [analyzeCapture]);

  // ── Approve proposal ──
  const approveProposal = useCallback((proposal) => {
    setProposals(prev => prev.filter(p => p.id !== proposal.id));

    if (proposal.type === "reminder") {
      if (!googleToken) {
        save("aria_pending_reminder", proposal);
        window.location.href = getGoogleAuthUrl();
        return;
      }
      setReminderProposal(proposal);
      return;
    }

    if (proposal.type === "calendar") {
      if (!googleToken) {
        save("aria_pending_calendar", proposal);
        window.location.href = getGoogleAuthUrl();
        return;
      }
      setCalendarProposal(proposal);
      return;
    }

    // task / insight / default → add to tasks
    const newId = Date.now();
    const newTask = { id: newId, title: proposal.title, cat: proposal.type === "health" ? "Health" : proposal.type === "personal" ? "Personal" : "Work", priority: "medium", due: "This week", done: false };
    setTasks(prev => [newTask, ...prev]);
    const tok = load("aria_google_token", null);
    if (tok) createGTask(tok, proposal.title).then(gt => { if (gt.id) setTasks(prev => prev.map(t => t.id === newId ? { ...t, gTaskId: gt.id } : t)); }).catch(() => {});
    setTab("tasks");
  }, []);

  const addNote = useCallback((text) => {
    const now = new Date();
    setNotes(prev => [{ id: Date.now(), text, ago: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }, ...prev]);
  }, [setNotes]);

  const deleteNote = useCallback((id) => setNotes(prev => prev.filter(n => n.id !== id)), [setNotes]);

  const sendNoteToARIA = useCallback((note) => {
    const id = Date.now();
    const capture = { id, text: note.text, type: "text", ago: "Just now", tags: [] };
    setCaptures(prev => [capture, ...prev]);
    analyzeCapture(id, note.text);
    setTab("captures");
  }, [setCaptures, analyzeCapture]);

  const dismissProposal = useCallback((id) => setProposals(prev => prev.filter(p => p.id !== id)), [setProposals]);
  const deleteCapture = useCallback((id) => {
    setCaptures(prev => prev.filter(c => c.id !== id));
    setProposals(prev => prev.filter(p => p.sourceId !== id));
    setTasks(prev => prev.filter(t => t.sourceId !== id));
  }, [setCaptures, setProposals, setTasks]);

  const propBadge = proposals.length;

  return (
    <div style={{ fontFamily: F, background: C.bg, height: "100dvh", display: "flex", flexDirection: "column", maxWidth: 430, margin: "0 auto", position: "relative", overflow: "hidden" }}>

      {/* Status bar */}
      <div style={{ padding: "12px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim }}>{new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
        <div style={{ fontFamily: F, fontSize: 14, fontWeight: 800, color: C.accent, letterSpacing: "0.06em" }}>ARIA</div>
        <div style={{ fontFamily: F, fontSize: 12, color: C.dim }}>
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: googleToken ? C.green : C.dim, marginRight: 5, verticalAlign: "middle" }} />
          {googleToken ? "active" : "active"}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {tab === "home"      && <HomeTab captures={captures} tasks={tasks} proposals={proposals} upcoming={upcoming} notes={notes} onApprove={approveProposal} onDismiss={dismissProposal} completionItems={completionItems} onDone={handleDone} onSnooze={handleSnooze} />}
        {tab === "captures"  && <CapturesTab captures={captures} notes={notes} onDelete={deleteCapture} onEdit={setEditingCapture} onDeleteNote={deleteNote} onSendNoteToARIA={sendNoteToARIA} />}
        {tab === "tasks"     && <TasksTab tasks={tasks} setTasks={setTasks} setUpcoming={setUpcoming} />}
        {tab === "proposals" && <ProposalsTab proposals={proposals} onApprove={approveProposal} onDismiss={dismissProposal} />}
        {tab === "upcoming"  && <UpcomingTab upcoming={upcoming} setUpcoming={setUpcoming} />}
      </div>

      {/* Text capture FAB */}
      {/* Google Reminder Modal */}
      {reminderProposal && googleToken && (
        <CreateReminderModal
          proposal={reminderProposal}
          googleToken={googleToken}
          onClose={() => setReminderProposal(null)}
          onCreated={() => {
            const id = Date.now();
            setProposals(prev => prev.filter(p => p.id !== reminderProposal.id));
            setTasks(prev => [{ id, title: reminderProposal.title, cat: "Work", priority: "high", due: "Reminder set", done: false, isReminder: true, createdAt: Date.now() }, ...prev]);
            setUpcoming(prev => [{ id, title: reminderProposal.title, detail: "Reminder via Google Calendar", badge: "⏰", urgency: C.green, isReminder: true, createdAt: Date.now() }, ...prev]);
            setReminderProposal(null);
            setTab("tasks");
          }}
        />
      )}

      {/* Google Calendar Event Modal */}
      {calendarProposal && googleToken && (
        <CreateEventModal
          proposal={calendarProposal}
          googleToken={googleToken}
          onClose={() => setCalendarProposal(null)}
          onCreated={() => {
            const id = Date.now();
            setProposals(prev => prev.filter(p => p.id !== calendarProposal.id));
            setTasks(prev => [{ id, title: calendarProposal.title, cat: "Work", priority: "medium", due: "Scheduled", done: false, isCalendar: true }, ...prev]);
            setUpcoming(prev => [{ id, title: calendarProposal.title, detail: "Added to Google Calendar", badge: "📅", urgency: C.blue, isCalendar: true, createdAt: Date.now() }, ...prev]);
            setCalendarProposal(null);
            setTab("tasks");
          }}
        />
      )}

      {/* Text capture modal */}
      {showTextCapture && <TextCaptureModal onClose={() => setShowTextCapture(false)} onSubmit={(text) => addCapture(text, "text")} onSaveNote={addNote} />}

      {/* Edit capture modal */}
      {editingCapture && <EditCaptureModal capture={editingCapture} onSave={editCapture} onClose={() => setEditingCapture(null)} />}

      {/* Bottom nav */}
      <div style={{ background: C.s1, borderTop: `1px solid ${C.border}`, flexShrink: 0, paddingBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <button onClick={() => setShowTextCapture(true)} className="btn-press"
            style={{ width: 54, height: 54, borderRadius: "50%", border: "none", background: C.accent, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 4px ${C.accentL}, 0 4px 20px rgba(43,95,140,0.35)`, outline: "none" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
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
  );
}