import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Bloco de Notas Flutuante
 * Bolha flutuante + janela com abas, arrastável, com persistência em localStorage.
 * Renderize <FloatingNotepad /> uma única vez, perto da raiz do app (ex: App.tsx),
 * para que apareça em todas as telas.
 */

const STORE_KEY = "floating-notepad-v1";

interface NoteTab {
  id: string;
  name: string;
  content: string;
}

interface Pos {
  x: number;
  y: number;
}

interface NotepadState {
  open: boolean;
  winPos: Pos | null;
  bubblePos: Pos | null;
  activeTabId: string;
  tabs: NoteTab[];
}

function uid() {
  return "n" + Math.random().toString(36).slice(2, 9);
}

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

function loadState(): NotepadState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs) && parsed.tabs.length) {
        return Object.assign(defaultState(), parsed);
      }
    }
  } catch {
    /* no stored value yet */
  }
  return defaultState();
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
  const [state, setState] = useState<NotepadState>(() => loadState());
  const [saveState, setSaveState] = useState("salvo");
  const [copyFlash, setCopyFlash] = useState(false);
  const [toast, setToast] = useState<{ msg: string; x: number; y: number } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const winRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleDragged = useRef(false);

  const activeTab = useCallback(
    (s: NotepadState = state) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0],
    [state]
  );

  // ---------- persistence ----------
  const scheduleSave = useCallback((next: NotepadState) => {
    setSaveState("salvando…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(next));
        setSaveState("salvo");
      } catch {
        setSaveState("erro ao salvar");
      }
    }, 400);
  }, []);

  const update = useCallback(
    (fn: (prev: NotepadState) => NotepadState) => {
      setState((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // ---------- positioning ----------
  const applyWinPos = useCallback(() => {
    const el = winRef.current;
    if (!el) return;
    const w = el.offsetWidth || 340;
    const h = el.offsetHeight || 420;
    let pos = state.winPos;
    if (!pos) {
      pos = { x: window.innerWidth - w - 28, y: window.innerHeight - h - 28 };
    }
    const c = clamp(pos.x, pos.y, w, h);
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
  }, [state.winPos]);

  const applyBubblePos = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const w = 52,
      h = 52;
    let pos = state.bubblePos;
    if (!pos) {
      pos = { x: window.innerWidth - w - 28, y: window.innerHeight - h - 28 };
    }
    const c = clamp(pos.x, pos.y, w, h);
    el.style.left = c.x + "px";
    el.style.top = c.y + "px";
  }, [state.bubblePos]);

  useEffect(() => {
    if (state.open) applyWinPos();
    else applyBubblePos();
  }, [state.open, applyWinPos, applyBubblePos]);

  useEffect(() => {
    const onResize = () => (state.open ? applyWinPos() : applyBubblePos());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [state.open, applyWinPos, applyBubblePos]);

  // ---------- generic drag ----------
  function makeDraggable(
    handle: HTMLElement,
    target: HTMLElement,
    onEnd: (moved: boolean, rect: DOMRect) => void
  ) {
    let dragging = false;
    let moved = false;
    let startX = 0,
      startY = 0,
      origX = 0,
      origY = 0;

    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement;
      if (t.closest(".fnp-iconbtn") || t.closest(".fnp-closetab") || t.closest(".fnp-addtab")) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = target.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      handle.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      const w = target.offsetWidth,
        h = target.offsetHeight;
      const pos = clamp(origX + dx, origY + dy, w, h);
      target.style.left = pos.x + "px";
      target.style.top = pos.y + "px";
    }
    function onPointerUp(e: PointerEvent) {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture(e.pointerId);
      onEnd(moved, target.getBoundingClientRect());
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
    };
  }

  useEffect(() => {
    if (!headerRef.current || !winRef.current) return;
    return makeDraggable(headerRef.current, winRef.current, (_moved, rect) => {
      update((prev) => ({ ...prev, winPos: { x: rect.left, y: rect.top } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bubbleRef.current) return;
    return makeDraggable(bubbleRef.current, bubbleRef.current, (moved, rect) => {
      bubbleDragged.current = moved;
      update((prev) => ({ ...prev, bubblePos: { x: rect.left, y: rect.top } }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- editor ----------
  useEffect(() => {
    if (editorRef.current) editorRef.current.value = activeTab().content;
  }, [state.activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- focus tab label when renaming ----------
  const editInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editingTabId) return;
    const el = editInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTabId]);

  function startRename(tab: NoteTab) {
    setEditingValue(tab.name);
    setEditingTabId(tab.id);
  }

  function commitRename() {
    if (editingTabId) renameTab(editingTabId, editingValue);
    setEditingTabId(null);
  }

  function handleEditorInput() {
    const val = editorRef.current?.value ?? "";
    update((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === prev.activeTabId ? { ...t, content: val } : t)),
    }));
  }

  const hasContent = state.tabs.some((t) => t.content.trim().length > 0);

  // ---------- tabs ----------
  function setActiveTab(id: string) {
    update((prev) => ({ ...prev, activeTabId: id }));
    editorRef.current?.focus();
  }

  function addTab() {
    const n = state.tabs.length + 1;
    const tab: NoteTab = { id: uid(), name: "Nota " + n, content: "" };
    update((prev) => ({ ...prev, tabs: [...prev.tabs, tab], activeTabId: tab.id }));
  }

  function closeTab(id: string) {
    setState((prev) => {
      if (prev.tabs.length <= 1) return prev;
      const idx = prev.tabs.findIndex((t) => t.id === id);
      const tabs = prev.tabs.filter((t) => t.id !== id);
      let activeTabId = prev.activeTabId;
      if (activeTabId === id) {
        const next = tabs[Math.max(0, idx - 1)];
        activeTabId = next.id;
      }
      const next = { ...prev, tabs, activeTabId };
      scheduleSave(next);
      return next;
    });
  }

  function renameTab(id: string, name: string) {
    update((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, name: name.trim() || "Sem título" } : t)),
    }));
  }

  // ---------- footer actions ----------
  async function handleCopy() {
    const text = activeTab().content;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (editorRef.current) {
        editorRef.current.select();
        document.execCommand("copy");
        window.getSelection()?.removeAllRanges();
      }
    }
    setCopyFlash(true);
    setTimeout(() => setCopyFlash(false), 1000);
  }

  function handleDownload() {
    const tab = activeTab();
    downloadText(sanitizeFilename(tab.name) + ".txt", tab.content);
  }

  function handleDownloadAll() {
    const combined = state.tabs
      .map((t) => "===== " + t.name + " =====\n\n" + t.content)
      .join("\n\n\n");
    downloadText("bloco-de-notas.txt", combined);
  }

  function handleClear(e: React.MouseEvent<HTMLButtonElement>) {
    const tab = activeTab();
    if (!tab.content) return;
    update((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === prev.activeTabId ? { ...t, content: "" } : t)),
    }));
    if (editorRef.current) editorRef.current.value = "";
    const rect = e.currentTarget.getBoundingClientRect();
    setToast({ msg: "Aba limpa", x: rect.left, y: rect.top - 30 });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }

  // ---------- collapse / expand ----------
  function setOpen(open: boolean) {
    update((prev) => ({ ...prev, open }));
    if (open) setTimeout(() => editorRef.current?.focus(), 0);
  }

  function onBubbleClick() {
    if (bubbleDragged.current) {
      bubbleDragged.current = false;
      return;
    }
    setOpen(true);
  }

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2147483000 }}>
      <style>{`
        .fnp-scope{
          --fnp-paper:#FAF8F4; --fnp-paper-alt:#F1EDE4; --fnp-ink:#242019; --fnp-ink-soft:#736C5C;
          --fnp-chrome:#23262B; --fnp-chrome-soft:#33373D; --fnp-accent:#3F6857; --fnp-accent-soft:#E3ECE6;
          --fnp-border:#DBD5C7; --fnp-danger:#AD4A3B;
          --fnp-shadow: 0 10px 30px rgba(20,18,14,.28), 0 2px 8px rgba(20,18,14,.18);
          font-family:'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
          color:var(--fnp-ink);
        }
        .fnp-bubble{
          position:absolute; width:52px; height:52px; border-radius:50%;
          background:var(--fnp-chrome); border:1px solid var(--fnp-chrome-soft);
          box-shadow:var(--fnp-shadow); display:flex; align-items:center; justify-content:center;
          cursor:grab; pointer-events:auto; user-select:none; transition: transform .15s ease;
        }
        .fnp-bubble:active{ cursor:grabbing; }
        .fnp-bubble:hover{ transform: scale(1.06); }
        .fnp-bubble svg{ width:22px; height:22px; }
        .fnp-dot{ position:absolute; top:2px; right:2px; width:9px; height:9px; border-radius:50%;
          background:var(--fnp-accent); border:2px solid var(--fnp-chrome); display:none; }
        .fnp-bubble.has-content .fnp-dot{ display:block; }
        .fnp-win{
          position:absolute; width:340px; height:420px; min-width:280px; min-height:260px;
          max-width:92vw; max-height:86vh; background:var(--fnp-paper); border:1px solid var(--fnp-border);
          border-radius:6px; box-shadow:var(--fnp-shadow); display:flex; flex-direction:column;
          overflow:hidden; pointer-events:auto; resize:both;
        }
        .fnp-header{
          background:var(--fnp-chrome); color:#EDEAE2; display:flex; align-items:center;
          padding:0 6px 0 10px; height:36px; flex:0 0 auto; cursor:grab; user-select:none;
        }
        .fnp-header:active{ cursor:grabbing; }
        .fnp-title{ font-size:12.5px; font-weight:500; letter-spacing:.2px; flex:1;
          display:flex; align-items:center; gap:7px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .fnp-title svg{ width:14px; height:14px; opacity:.85; flex:0 0 auto; }
        .fnp-savestate{ font-size:10.5px; color:#B9B2A0; margin-right:6px; white-space:nowrap; }
        .fnp-iconbtn{ width:26px; height:26px; display:flex; align-items:center; justify-content:center;
          background:transparent; border:none; border-radius:4px; color:inherit; cursor:pointer; opacity:.85; }
        .fnp-iconbtn:hover{ background:rgba(255,255,255,.12); opacity:1; }
        .fnp-iconbtn svg{ width:15px; height:15px; }
        .fnp-tabs{ display:flex; align-items:stretch; background:var(--fnp-paper-alt);
          border-bottom:1px solid var(--fnp-border); flex:0 0 auto; overflow-x:auto; scrollbar-width:thin; }
        .fnp-tab{ display:flex; align-items:center; gap:5px; padding:7px 8px 6px 11px; font-size:12px;
          color:var(--fnp-ink-soft); border-right:1px solid var(--fnp-border); cursor:pointer;
          white-space:nowrap; max-width:130px; position:relative; }
        .fnp-tab .fnp-label{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; outline:none; }
        .fnp-label-input{ width:70px; font: inherit; color: inherit; background: var(--fnp-paper);
          border: 1px solid var(--fnp-accent); border-radius: 3px; padding: 0 3px; outline: none; }
        .fnp-tab.active{ color:var(--fnp-ink); background:var(--fnp-paper); font-weight:500; }
        .fnp-tab.active::after{ content:''; position:absolute; left:0; right:0; bottom:-1px; height:2px; background:var(--fnp-accent); }
        .fnp-closetab{ width:14px; height:14px; border-radius:3px; display:flex; align-items:center;
          justify-content:center; opacity:0; flex:0 0 auto; }
        .fnp-tab:hover .fnp-closetab{ opacity:.55; }
        .fnp-closetab:hover{ opacity:1; background:rgba(0,0,0,.08); }
        .fnp-closetab svg{ width:9px; height:9px; }
        .fnp-addtab{ flex:0 0 auto; width:30px; display:flex; align-items:center; justify-content:center;
          color:var(--fnp-ink-soft); cursor:pointer; }
        .fnp-addtab:hover{ color:var(--fnp-ink); background:var(--fnp-accent-soft); }
        .fnp-addtab svg{ width:13px; height:13px; }
        .fnp-body{ flex:1 1 auto; min-height:0; display:flex; }
        .fnp-editor{ flex:1; resize:none; border:none; outline:none; padding:12px 14px;
          background:var(--fnp-paper); color:var(--fnp-ink);
          font-family:'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
          font-size:12.5px; line-height:1.55; }
        .fnp-editor::placeholder{ color:#B7AF9C; }
        .fnp-footer{ flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
          padding:5px 8px; border-top:1px solid var(--fnp-border); background:var(--fnp-paper-alt); }
        .fnp-footer .fnp-left, .fnp-footer .fnp-right{ display:flex; align-items:center; gap:2px; }
        .fnp-footbtn{ display:flex; align-items:center; gap:5px; padding:5px 8px; font-size:11px;
          font-family:inherit; color:var(--fnp-ink-soft); background:transparent; border:none;
          border-radius:4px; cursor:pointer; }
        .fnp-footbtn svg{ width:13px; height:13px; }
        .fnp-footbtn:hover{ color:var(--fnp-ink); background:var(--fnp-accent-soft); }
        .fnp-footbtn.danger:hover{ color:var(--fnp-danger); background:#F3E4E0; }
        .fnp-copyflash{ font-size:10.5px; color:var(--fnp-accent); opacity:0; transition:opacity .2s; }
        .fnp-copyflash.show{ opacity:1; }
        .fnp-toast{ position:absolute; padding:6px 11px; background:var(--fnp-chrome); color:#EDEAE2;
          font-size:11.5px; border-radius:4px; box-shadow:var(--fnp-shadow); opacity:0; pointer-events:none;
          transition:opacity .2s ease, transform .2s ease; transform:translateY(4px); z-index:5; }
        .fnp-toast.show{ opacity:1; transform:translateY(0); }
        .fnp-hidden{ display:none; }
      `}</style>

      <div className="fnp-scope">
        <div ref={winRef} className={"fnp-win" + (state.open ? "" : " fnp-hidden")}>
          <div ref={headerRef} className="fnp-header">
            <div className="fnp-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M4 4h11l5 5v11H4V4z" />
                <path d="M15 4v5h5" />
                <path d="M8 13h8M8 17h5" />
              </svg>
              <span>Bloco de Notas</span>
            </div>
            <span className="fnp-savestate">{saveState}</span>
            <button
              className="fnp-iconbtn"
              title="Recolher"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M5 12h14" />
              </svg>
            </button>
          </div>

          <div className="fnp-tabs">
            {state.tabs.map((tab) => (
              <div
                key={tab.id}
                className={"fnp-tab" + (tab.id === state.activeTabId ? " active" : "")}
                onClick={() => setActiveTab(tab.id)}
              >
                {editingTabId === tab.id ? (
                  <input
                    ref={editInputRef}
                    className="fnp-label-input"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingTabId(null);
                      }
                    }}
                  />
                ) : (
                  <span
                    className="fnp-label"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(tab);
                    }}
                  >
                    {tab.name}
                  </span>
                )}
                {state.tabs.length > 1 && (
                  <span
                    className="fnp-closetab"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M5 5l14 14M19 5L5 19" />
                    </svg>
                  </span>
                )}
              </div>
            ))}
            <div className="fnp-addtab" title="Nova aba" onClick={addTab}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
          </div>

          <div className="fnp-body">
            <textarea
              ref={editorRef}
              className="fnp-editor"
              placeholder="Anote aqui durante a ligação…"
              spellCheck={false}
              defaultValue={activeTab().content}
              onInput={handleEditorInput}
            />
          </div>

          <div className="fnp-footer">
            <div className="fnp-left">
              <button className="fnp-footbtn" title="Copiar aba atual" onClick={handleCopy}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="9" y="9" width="12" height="12" rx="1.5" />
                  <path d="M5 15V4.5A1.5 1.5 0 0 1 6.5 3H15" />
                </svg>
                Copiar
              </button>
              <button className="fnp-footbtn" title="Baixar aba atual (.txt)" onClick={handleDownload}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M12 3v12" />
                  <path d="M7 10l5 5 5-5" />
                  <path d="M5 20h14" />
                </svg>
                Baixar
              </button>
              <button className="fnp-footbtn" title="Baixar todas as abas (.txt)" onClick={handleDownloadAll}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="4" y="4" width="12" height="14" rx="1" />
                  <path d="M9 8h11v10a2 2 0 0 1-2 2H9" />
                </svg>
                Tudo
              </button>
            </div>
            <div className="fnp-right">
              <span className={"fnp-copyflash" + (copyFlash ? " show" : "")}>copiado</span>
              <button className="fnp-footbtn danger" title="Limpar aba atual" onClick={handleClear}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="M6 7l1 13h10l1-13" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div
          ref={bubbleRef}
          className={"fnp-bubble" + (hasContent ? " has-content" : "") + (state.open ? " fnp-hidden" : "")}
          title="Abrir bloco de notas"
          onClick={onBubbleClick}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#EDEAE2" strokeWidth={1.8}>
            <path d="M4 4h11l5 5v11H4V4z" />
            <path d="M15 4v5h5" />
            <path d="M8 13h8M8 17h5" />
          </svg>
          <div className="fnp-dot" />
        </div>

        {toast && (
          <div className="fnp-toast show" style={{ left: toast.x, top: toast.y }}>
            {toast.msg}
          </div>
        )}
      </div>
    </div>
  );
}
