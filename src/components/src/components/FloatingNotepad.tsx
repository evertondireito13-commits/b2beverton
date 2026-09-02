import { useEffect, useRef, useState } from "react";

type Tab = { id: string; name: string; content: string };
type NotepadState = {
  open: boolean;
  winPos: { x: number; y: number } | null;
  bubblePos: { x: number; y: number } | null;
  activeTabId: string;
  tabs: Tab[];
};

const STORE_KEY = "floating-notepad-v1";
const uid = () => "n" + Math.random().toString(36).slice(2, 9);

function defaultState(): NotepadState {
  const id = uid();
  return {
    open: true,
    winPos: null,
    bubblePos: null,
    activeTabId: id,
    tabs: [{ id, name: "Nota 1", content: "" }],
  };
}

function clamp(x: number, y: number, w: number, h: number) {
  const maxX = window.innerWidth - w - 8;
  const maxY = window.innerHeight - h - 8;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, maxX)),
    y: Math.min(Math.max(8, y), Math.max(8, maxY)),
  };
}

function sanitizeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "nota";
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function FloatingNotepad() {
  const [state, setState] = useState<NotepadState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const winRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const dragInfo = useRef<{ target: "win" | "bubble"; startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  // carregar do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length) {
          setState({ ...defaultState(), ...parsed });
          setLoaded(true);
          return;
        }
      }
    } catch {}
    setLoaded(true);
  }, []);

  // salvar no localStorage (com debounce)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [state, loaded]);

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

  // posição inicial
  useEffect(() => {
    if (!loaded) return;
    setState((s) => {
      const w = 340, h = 420;
      const winPos = s.winPos ?? clamp(window.innerWidth - w - 28, window.innerHeight - h - 28, w, h);
      const bubblePos = s.bubblePos ?? clamp(window.innerWidth - 52 - 28, window.innerHeight - 52 - 28, 52, 52);
      return { ...s, winPos, bubblePos };
    });
  }, [loaded]);

  function updateTab(id: string, patch: Partial<Tab>) {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }

  function setActiveTab(id: string) {
    setState((s) => ({ ...s, activeTabId: id }));
  }

  function addTab() {
    setState((s) => {
      const tab: Tab = { id: uid(), name: `Nota ${s.tabs.length + 1}`, content: "" };
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id };
    });
  }

  function closeTab(id: string) {
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId = s.activeTabId === id ? tabs[Math.max(0, idx - 1)].id : s.activeTabId;
      return { ...s, tabs, activeTabId };
    });
  }

  function setOpen(open: boolean) {
    setState((s) => ({ ...s, open }));
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeTab.content);
    } catch {
      editorRef.current?.select();
      document.execCommand("copy");
    }
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 1000);
  }

  function handleDownload() {
    downloadText(sanitizeFilename(activeTab.name) + ".txt", activeTab.content);
  }

  function handleDownloadAll() {
    const combined = state.tabs.map((t) => `===== ${t.name} =====\n\n${t.content}`).join("\n\n\n");
    downloadText("bloco-de-notas.txt", combined);
  }

  function handleClear() {
    if (!activeTab.content) return;
    updateTab(activeTab.id, { content: "" });
  }

  // drag
  function startDrag(target: "win" | "bubble", e: React.PointerEvent) {
    const el = target === "win" ? state.winPos : state.bubblePos;
    if (!el) return;
    dragInfo.current = { target, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, moved: false };
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", endDrag);
  }
  function onDrag(e: PointerEvent) {
    const info = dragInfo.current;
    if (!info) return;
    const dx = e.clientX - info.startX, dy = e.clientY - info.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) info.moved = true;
    const w = info.target === "win" ? winRef.current?.offsetWidth ?? 340 : 52;
    const h = info.target === "win" ? winRef.current?.offsetHeight ?? 420 : 52;
    const pos = clamp(info.origX + dx, info.origY + dy, w, h);
    setState((s) => (info.target === "win" ? { ...s, winPos: pos } : { ...s, bubblePos: pos }));
  }
  function endDrag() {
    window.removeEventListener("pointermove", onDrag);
    window.removeEventListener("pointerup", endDrag);
    dragInfo.current = null;
  }

  if (!loaded) return null;

  const css = `
    .fnp-win{position:fixed;width:340px;height:420px;min-width:280px;min-height:260px;max-width:92vw;max-height:86vh;background:#FAF8F4;border:1px solid #DBD5C7;border-radius:6px;box-shadow:0 10px 30px rgba(20,18,14,.28),0 2px 8px rgba(20,18,14,.18);display:flex;flex-direction:column;overflow:hidden;resize:both;z-index:9999;font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif;color:#242019}
    .fnp-header{background:#23262B;color:#EDEAE2;display:flex;align-items:center;padding:0 6px 0 10px;height:36px;cursor:grab;user-select:none}
    .fnp-title{font-size:12.5px;font-weight:500;flex:1;display:flex;align-items:center;gap:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .fnp-save{font-size:10.5px;color:#B9B2A0;margin-right:6px;white-space:nowrap}
    .fnp-iconbtn{width:26px;height:26px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:4px;color:inherit;cursor:pointer;opacity:.85}
    .fnp-iconbtn:hover{background:rgba(255,255,255,.12);opacity:1}
    .fnp-tabs{display:flex;align-items:stretch;background:#F1EDE4;border-bottom:1px solid #DBD5C7;overflow-x:auto}
    .fnp-tab{display:flex;align-items:center;gap:5px;padding:7px 8px 6px 11px;font-size:12px;color:#736C5C;border-right:1px solid #DBD5C7;cursor:pointer;white-space:nowrap;max-width:130px;position:relative}
    .fnp-tab.active{color:#242019;background:#FAF8F4;font-weight:500}
    .fnp-tab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px;background:#3F6857}
    .fnp-close{width:14px;height:14px;border-radius:3px;display:flex;align-items:center;justify-content:center;opacity:.55;flex:0 0 auto}
    .fnp-close:hover{opacity:1;background:rgba(0,0,0,.08)}
    .fnp-addtab{flex:0 0 auto;width:30px;display:flex;align-items:center;justify-content:center;color:#736C5C;cursor:pointer}
    .fnp-addtab:hover{color:#242019;background:#E3ECE6}
    .fnp-editor{flex:1;resize:none;border:none;outline:none;padding:12px 14px;background:#FAF8F4;color:#242019;font-family:'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:12.5px;line-height:1.55;width:100%}
    .fnp-footer{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-top:1px solid #DBD5C7;background:#F1EDE4}
    .fnp-footbtn{display:flex;align-items:center;gap:5px;padding:5px 8px;font-size:11px;font-family:inherit;color:#736C5C;background:transparent;border:none;border-radius:4px;cursor:pointer}
    .fnp-footbtn:hover{color:#242019;background:#E3ECE6}
    .fnp-footbtn.danger:hover{color:#AD4A3B;background:#F3E4E0}
    .fnp-bubble{position:fixed;width:52px;height:52px;border-radius:50%;background:#23262B;border:1px solid #33373D;box-shadow:0 10px 30px rgba(20,18,14,.28);display:flex;align-items:center;justify-content:center;cursor:grab;z-index:9999}
    .fnp-dot{position:absolute;top:2px;right:2px;width:9px;height:9px;border-radius:50%;background:#3F6857;border:2px solid #23262B}
  `;

  return (
    <>
      <style>{css}</style>

      {state.open && state.winPos && (
        <div ref={winRef} className="fnp-win" style={{ left: state.winPos.x, top: state.winPos.y }}>
          <div className="fnp-header" onPointerDown={(e) => startDrag("win", e)}>
            <div className="fnp-title">📝 Bloco de Notas</div>
            <span className="fnp-save">salvo</span>
            <button className="fnp-iconbtn" onClick={() => setOpen(false)} title="Recolher">━</button>
          </div>

          <div className="fnp-tabs">
            {state.tabs.map((tab) => (
              <div key={tab.id} className={"fnp-tab" + (tab.id === state.activeTabId ? " active" : "")} onClick={() => setActiveTab(tab.id)}>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => updateTab(tab.id, { name: e.currentTarget.textContent?.trim() || "Sem título" })}
                  onClick={(e) => e.stopPropagation()}
                >
                  {tab.name}
                </span>
                {state.tabs.length > 1 && (
                  <span className="fnp-close" onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>✕</span>
                )}
              </div>
            ))}
            <div className="fnp-addtab" onClick={addTab}>＋</div>
          </div>

          <textarea
            ref={editorRef}
            className="fnp-editor"
            placeholder="Anote aqui durante a ligação…"
            spellCheck={false}
            value={activeTab.content}
            onChange={(e) => updateTab(activeTab.id, { content: e.target.value })}
          />

          <div className="fnp-footer">
            <div style={{ display: "flex", gap: 2 }}>
              <button className="fnp-footbtn" onClick={handleCopy}>{copyFlash ? "copiado" : "Copiar"}</button>
              <button className="fnp-footbtn" onClick={handleDownload}>Baixar</button>
              <button className="fnp-footbtn" onClick={handleDownloadAll}>Tudo</button>
            </div>
            <button className="fnp-footbtn danger" onClick={handleClear}>🗑</button>
          </div>
        </div>
      )}

      {!state.open && state.bubblePos && (
        <div
          ref={bubbleRef}
          className="fnp-bubble"
          style={{ left: state.bubblePos.x, top: state.bubblePos.y }}
          onPointerDown={(e) => startDrag("bubble", e)}
          onClick={() => { if (!dragInfo.current?.moved) setOpen(true); }}
          title="Abrir bloco de notas"
        >
          📝
          {state.tabs.some((t) => t.content.trim()) && <div className="fnp-dot" />}
        </div>
      )}
    </>
  );
}
