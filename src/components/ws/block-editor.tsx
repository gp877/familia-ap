"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { wsCreatePage, wsSaveContent } from "@/app/actions/workspace";
import { BLOCK_LABEL, type Block, type BlockType, newId } from "@/lib/workspace-model";

import { MenuItem, Popover } from "./ws-ui";

type SubPage = { id: string; title: string; icon: string | null };

const SLASH_ITEMS: Array<{ type: BlockType; hint: string; keys: string }> = [
  { type: "paragraph", hint: "", keys: "texto paragrafo" },
  { type: "h1", hint: "#", keys: "titulo 1 h1 heading" },
  { type: "h2", hint: "##", keys: "titulo 2 h2" },
  { type: "h3", hint: "###", keys: "titulo 3 h3" },
  { type: "todo", hint: "[]", keys: "tarefa todo checklist lista de tarefas" },
  { type: "bullet", hint: "-", keys: "lista marcadores bullet" },
  { type: "numbered", hint: "1.", keys: "lista numerada numero" },
  { type: "toggle", hint: "", keys: "recolhivel toggle sanfona" },
  { type: "quote", hint: ">", keys: "citacao quote" },
  { type: "callout", hint: "", keys: "destaque callout aviso" },
  { type: "divider", hint: "---", keys: "divisoria linha divider" },
  { type: "code", hint: "```", keys: "codigo code" },
  { type: "page", hint: "", keys: "pagina subpagina page" },
];

const SHORTCUTS: Array<[RegExp, BlockType]> = [
  [/^###\s$/, "h3"],
  [/^##\s$/, "h2"],
  [/^#\s$/, "h1"],
  [/^[-*]\s$/, "bullet"],
  [/^1\.\s$/, "numbered"],
  [/^\[\s?\]\s$/, "todo"],
  [/^>\s$/, "quote"],
  [/^```$/, "code"],
];

const LIST_TYPES: BlockType[] = ["todo", "bullet", "numbered"];
const NO_TEXT: BlockType[] = ["divider", "page"];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function optionsFor(query: string) {
  const q = norm(query.trim());
  return SLASH_ITEMS.filter((it) => !q || norm(BLOCK_LABEL[it.type]).includes(q) || it.keys.includes(q));
}

// ── caret ──────────────────────────────────────────────────────────
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function setCaret(el: HTMLElement, offset: number) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function BlockEditor({
  pageId,
  initial,
  subpages,
  readOnly = false,
}: {
  pageId: string;
  initial: Block[];
  subpages: SubPage[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initial.length ? initial : [{ id: newId(), type: "paragraph", text: "" }]
  );
  const blocksRef = useRef(blocks);
  useLayoutEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  const els = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<{ id: string; offset: number | "end" } | null>(null);
  const [slash, setSlashState] = useState<{ id: string; query: string; index: number } | null>(null);
  // ref espelha o estado: teclas rápidas chegam antes da re-renderização
  const slashRef = useRef<{ id: string; query: string; index: number } | null>(null);
  const setSlash = (v: { id: string; query: string; index: number } | null) => {
    slashRef.current = v;
    setSlashState(v);
  };
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [saving, setSaving] = useState<"idle" | "pending" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subById = useMemo(() => new Map(subpages.map((s) => [s.id, s])), [subpages]);

  // ── salvar com debounce ──────────────────────────────────────────
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSaving("pending");
    wsSaveContent(pageId, blocksRef.current)
      .then(() => setSaving("saved"))
      .catch(() => setSaving("idle"));
  }, [pageId]);
  const schedule = useCallback(() => {
    if (readOnly) return;
    setSaving("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush, readOnly]);
  useEffect(() => {
    const onLeave = () => timer.current && flush();
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      if (timer.current) flush();
    };
  }, [flush]);

  const update = useCallback(
    (fn: (prev: Block[]) => Block[]) => {
      setBlocks((prev) => {
        const next = fn(prev);
        return next.length ? next : [{ id: newId(), type: "paragraph", text: "" }];
      });
      schedule();
    },
    [schedule]
  );

  /** Atualiza e já desenha (antes da próxima tecla) — usado quando o cursor muda de bloco. */
  const updateNow = (fn: (prev: Block[]) => Block[]) => {
    const next = fn(blocksRef.current);
    blocksRef.current = next.length ? next : blocksRef.current;
    flushSync(() => update(fn));
  };

  useLayoutEffect(() => {
    const f = pendingFocus.current;
    if (!f) return;
    const el = els.current.get(f.id);
    if (el) {
      setCaret(el, f.offset === "end" ? (el.textContent?.length ?? 0) : f.offset);
      pendingFocus.current = null;
    }
  });

  const focusBlock = (id: string, offset: number | "end") => {
    pendingFocus.current = { id, offset };
    const el = els.current.get(id);
    if (el) {
      setCaret(el, offset === "end" ? (el.textContent?.length ?? 0) : offset);
      pendingFocus.current = null;
    }
  };

  const setText = (id: string, text: string) => {
    // Atalhos de markdown no começo do bloco
    for (const [rx, type] of SHORTCUTS) {
      if (rx.test(text)) {
        const el = els.current.get(id);
        if (el) el.textContent = "";
        setSlash(null);
        updateNow((prev) => prev.map((b) => (b.id === id ? { ...b, type, text: "" } : b)));
        focusBlock(id, 0);
        return;
      }
    }
    if (text === "---") {
      const nid = newId();
      updateNow((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        const out = [...prev];
        out.splice(i, 1, { id, type: "divider", text: "" }, { id: nid, type: "paragraph", text: "" });
        return out;
      });
      focusBlock(nid, 0);
      return;
    }
    const cur = slashRef.current;
    if (text.startsWith("/")) setSlash({ id, query: text.slice(1), index: cur?.id === id ? cur.index : 0 });
    else if (cur?.id === id) setSlash(null);
    update((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  };

  const insertAfter = (id: string, block: Block) => {
    update((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const out = [...prev];
      out.splice(i + 1, 0, block);
      return out;
    });
  };

  const applySlash = async (id: string, type: BlockType) => {
    setSlash(null);
    const el = els.current.get(id);
    if (el) el.textContent = "";
    if (type === "page") {
      const r = await wsCreatePage({ parentId: pageId, kind: "page", title: "" });
      update((prev) => prev.map((b) => (b.id === id ? { id, type: "page", text: "", pageId: r.id } : b)));
      flush();
      router.push(`/tarefas/${r.id}`);
      return;
    }
    if (type === "divider") {
      const nid = newId();
      updateNow((prev) => {
        const i = prev.findIndex((b) => b.id === id);
        const out = [...prev];
        out.splice(i, 1, { id, type: "divider", text: "" }, { id: nid, type: "paragraph", text: "" });
        return out;
      });
      focusBlock(nid, 0);
      return;
    }
    updateNow((prev) => prev.map((b) => (b.id === id ? { ...b, type, text: "", ...(type === "toggle" ? { open: true } : {}) } : b)));
    focusBlock(id, 0);
  };

  const slashOptions = useMemo(() => (slash ? optionsFor(slash.query) : []), [slash]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>, b: Block, idx: number) => {
    const el = e.currentTarget;
    const sl = slashRef.current;
    const opts = sl && sl.id === b.id ? optionsFor(sl.query) : [];
    if (sl && sl.id === b.id && opts.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash({ ...sl, index: (sl.index + 1) % opts.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash({ ...sl, index: (sl.index - 1 + opts.length) % opts.length });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void applySlash(b.id, opts[Math.min(sl.index, opts.length - 1)]?.type ?? "paragraph");
        return;
      }
      if (e.key === "Escape") {
        setSlash(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && b.type !== "code") {
      e.preventDefault();
      const text = el.textContent ?? "";
      const off = caretOffset(el);
      if (LIST_TYPES.includes(b.type) && text === "") {
        updateNow((prev) => prev.map((x) => (x.id === b.id ? { ...x, type: "paragraph" } : x)));
        focusBlock(b.id, 0);
        return;
      }
      const before = text.slice(0, off);
      const after = text.slice(off);
      const nid = newId();
      const nextType: BlockType = LIST_TYPES.includes(b.type) ? b.type : "paragraph";
      el.textContent = before;
      updateNow((prev) => {
        const out = prev.map((x) => (x.id === b.id ? { ...x, text: before } : x));
        out.splice(idx + 1, 0, { id: nid, type: nextType, text: after, ...(nextType === "todo" ? { checked: false } : {}) });
        return out;
      });
      focusBlock(nid, 0);
      return;
    }
    if (e.key === "Backspace" && caretOffset(el) === 0 && !window.getSelection()?.toString()) {
      if (b.type !== "paragraph") {
        e.preventDefault();
        updateNow((prev) => prev.map((x) => (x.id === b.id ? { ...x, type: "paragraph" } : x)));
        focusBlock(b.id, 0);
        return;
      }
      if (idx === 0) return;
      e.preventDefault();
      const prevBlock = blocksRef.current[idx - 1];
      const text = el.textContent ?? "";
      if (NO_TEXT.includes(prevBlock.type)) {
        updateNow((prev) => prev.filter((x) => x.id !== prevBlock.id));
        focusBlock(b.id, 0);
        return;
      }
      const junction = prevBlock.text.length;
      const prevEl = els.current.get(prevBlock.id);
      if (prevEl) prevEl.textContent = prevBlock.text + text;
      updateNow((prev) => prev.filter((x) => x.id !== b.id).map((x) => (x.id === prevBlock.id ? { ...x, text: x.text + text } : x)));
      focusBlock(prevBlock.id, junction);
      return;
    }
    if (e.key === "ArrowUp" && caretOffset(el) === 0) {
      const prev = blocksRef.current.slice(0, idx).reverse().find((x) => !NO_TEXT.includes(x.type));
      if (prev) {
        e.preventDefault();
        focusBlock(prev.id, "end");
      }
    }
    if (e.key === "ArrowDown" && caretOffset(el) === (el.textContent?.length ?? 0)) {
      const next = blocksRef.current.slice(idx + 1).find((x) => !NO_TEXT.includes(x.type));
      if (next) {
        e.preventDefault();
        focusBlock(next.id, 0);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLElement>, b: Block, idx: number) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "");
    const lines = text.split("\n");
    if (lines.length === 1 || b.type === "code") {
      document.execCommand("insertText", false, text);
      return;
    }
    const el = e.currentTarget;
    const cur = el.textContent ?? "";
    const off = caretOffset(el);
    const first = cur.slice(0, off) + lines[0];
    const tail = cur.slice(off);
    el.textContent = first;
    const novos: Block[] = lines.slice(1).map((l, i) => ({
      id: newId(),
      type: "paragraph",
      text: i === lines.length - 2 ? l + tail : l,
    }));
    updateNow((prev) => {
      const out = prev.map((x) => (x.id === b.id ? { ...x, text: first } : x));
      out.splice(idx + 1, 0, ...novos);
      return out;
    });
    const last = novos[novos.length - 1];
    focusBlock(last.id, last.text.length - tail.length);
  };

  // ── arrastar blocos ─────────────────────────────────────────────
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    update((prev) => {
      const from = prev.findIndex((b) => b.id === dragId);
      const moving = prev[from];
      const rest = prev.filter((b) => b.id !== dragId);
      const to = rest.findIndex((b) => b.id === targetId);
      rest.splice(to, 0, moving);
      return rest;
    });
    setDragId(null);
    setDropId(null);
  };

  // número de cada item de lista numerada (recomeça quando a lista é interrompida)
  const numbers = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const b of blocks) {
      n = b.type === "numbered" ? n + 1 : 0;
      out.push(n);
    }
    return out;
  }, [blocks]);

  return (
    <div style={{ position: "relative", paddingBottom: 80 }}>
      <div style={{ position: "absolute", top: -26, right: 0, fontSize: 11, color: "var(--muted)" }}>
        {saving === "pending" ? "salvando…" : saving === "saved" ? "salvo" : ""}
      </div>
      {blocks.map((b, idx) => {
        const editable = !readOnly && !NO_TEXT.includes(b.type);
        return (
          <div
            key={b.id}
            className="ws-block"
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setDropId(b.id);
            }}
            onDrop={() => onDrop(b.id)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-start",
              gap: 4,
              borderTop: dropId === b.id && dragId !== b.id ? "2px solid var(--accent)" : "2px solid transparent",
              opacity: dragId === b.id ? 0.4 : 1,
            }}
          >
            {!readOnly && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="ws-handle"
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropId(null);
                  }}
                  onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                  title="Arraste para mover · clique para opções"
                  style={{
                    width: 18,
                    height: 24,
                    marginTop: b.type === "h1" ? 8 : b.type === "h2" ? 6 : 2,
                    border: 0,
                    background: "transparent",
                    color: "var(--muted)",
                    cursor: "grab",
                    fontSize: 13,
                    padding: 0,
                    borderRadius: 4,
                  }}
                >
                  ⋮⋮
                </button>
                <Popover open={menuFor === b.id} onClose={() => setMenuFor(null)} width={220}>
                  <MenuItem
                    onClick={() => {
                      const nid = newId();
                      insertAfter(b.id, { ...b, id: nid });
                      setMenuFor(null);
                    }}
                  >
                    Duplicar
                  </MenuItem>
                  <MenuItem
                    danger
                    onClick={() => {
                      update((prev) => prev.filter((x) => x.id !== b.id));
                      setMenuFor(null);
                    }}
                  >
                    Excluir bloco
                  </MenuItem>
                  {!NO_TEXT.includes(b.type) && (
                    <>
                      <div style={{ height: 1, background: "var(--line-d)", margin: "4px 0" }} />
                      {SLASH_ITEMS.filter((s) => !NO_TEXT.includes(s.type)).map((s) => (
                        <MenuItem
                          key={s.type}
                          active={s.type === b.type}
                          onClick={() => {
                            update((prev) => prev.map((x) => (x.id === b.id ? { ...x, type: s.type } : x)));
                            setMenuFor(null);
                          }}
                        >
                          Virar {BLOCK_LABEL[s.type].toLowerCase()}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Popover>
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "flex-start" }}>
              {b.type === "todo" && (
                <input
                  type="checkbox"
                  checked={!!b.checked}
                  disabled={readOnly}
                  onChange={(e) => update((prev) => prev.map((x) => (x.id === b.id ? { ...x, checked: e.target.checked } : x)))}
                  style={{ marginTop: 6, width: 15, height: 15, accentColor: "var(--accent)", flexShrink: 0, cursor: "pointer" }}
                />
              )}
              {b.type === "bullet" && <span style={{ marginTop: 3, color: "var(--ink-d)", width: 14, flexShrink: 0, textAlign: "center" }}>•</span>}
              {b.type === "numbered" && <span style={{ marginTop: 3, color: "var(--ink-d)", minWidth: 18, flexShrink: 0, fontSize: 14 }}>{numbers[idx]}.</span>}
              {b.type === "toggle" && (
                <button
                  type="button"
                  onClick={() => update((prev) => prev.map((x) => (x.id === b.id ? { ...x, open: !x.open } : x)))}
                  style={{ marginTop: 3, border: 0, background: "none", color: "var(--ink-d)", cursor: "pointer", width: 16, padding: 0, transform: b.open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
                >
                  ▸
                </button>
              )}
              {b.type === "callout" && <span style={{ marginTop: 4, flexShrink: 0 }}>💡</span>}

              {b.type === "divider" ? (
                <hr style={{ flex: 1, border: 0, borderTop: "1px solid var(--line-d)", margin: "12px 0" }} />
              ) : b.type === "page" ? (
                <a
                  href={b.pageId ? `/tarefas/${b.pageId}` : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    if (b.pageId) router.push(`/tarefas/${b.pageId}`);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 4px", color: "var(--ink)", textDecoration: "none", fontWeight: 500, borderBottom: "1px solid var(--line-d)" }}
                >
                  <span>{subById.get(b.pageId ?? "")?.icon ?? "📄"}</span>
                  <span>{subById.get(b.pageId ?? "")?.title || (subById.has(b.pageId ?? "") ? "Sem título" : "Página excluída ou sem acesso")}</span>
                </a>
              ) : (
                <div style={{ flex: 1, minWidth: 0, ...(b.type === "callout" || b.type === "quote" || b.type === "code" ? wrapStyle(b.type) : {}) }}>
                  <Editable
                    block={b}
                    readOnly={!editable}
                    register={(el) => (el ? els.current.set(b.id, el) : els.current.delete(b.id))}
                    onText={(t) => setText(b.id, t)}
                    onKeyDown={(e) => onKeyDown(e, b, idx)}
                    onPaste={(e) => onPaste(e, b, idx)}
                  />
                  {b.type === "toggle" && b.open && (
                    <textarea
                      value={b.body ?? ""}
                      readOnly={readOnly}
                      placeholder="Conteúdo recolhível…"
                      onChange={(e) => update((prev) => prev.map((x) => (x.id === b.id ? { ...x, body: e.target.value } : x)))}
                      rows={Math.max(2, (b.body ?? "").split("\n").length)}
                      style={{ width: "100%", marginTop: 2, padding: "4px 6px", background: "transparent", border: 0, borderLeft: "2px solid var(--line-d)", color: "var(--ink-d)", fontSize: 15, fontFamily: "inherit", resize: "vertical", outline: "none" }}
                    />
                  )}
                  {slash?.id === b.id && (
                    <div style={{ position: "relative" }}>
                      <Popover open onClose={() => setSlash(null)} width={260}>
                        {slashOptions.length === 0 ? (
                          <div style={{ padding: 8, fontSize: 12.5, color: "var(--muted)" }}>Nenhum tipo com esse nome</div>
                        ) : (
                          slashOptions.map((s, i) => (
                            <MenuItem key={s.type} active={i === slash.index} hint={s.hint} onClick={() => void applySlash(b.id, s.type)}>
                              {BLOCK_LABEL[s.type]}
                            </MenuItem>
                          ))
                        )}
                      </Popover>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {!readOnly && (
        <div
          onClick={() => {
            const last = blocks[blocks.length - 1];
            if (last && last.type === "paragraph" && !last.text) return focusBlock(last.id, 0);
            const nid = newId();
            update((prev) => [...prev, { id: nid, type: "paragraph", text: "" }]);
            pendingFocus.current = { id: nid, offset: 0 };
          }}
          style={{ height: 60, cursor: "text" }}
        />
      )}
    </div>
  );
}

function wrapStyle(type: BlockType): React.CSSProperties {
  if (type === "callout") return { background: "var(--card)", borderRadius: 8, padding: "6px 10px" };
  if (type === "quote") return { borderLeft: "3px solid var(--ink-d)", paddingLeft: 12 };
  return { background: "var(--surf)", borderRadius: 6, padding: "8px 10px", fontFamily: "var(--font-geist-mono, monospace)" };
}

const TEXT_STYLE: Partial<Record<BlockType, React.CSSProperties>> = {
  h1: { fontSize: 28, fontWeight: 700, marginTop: 14, lineHeight: 1.25 },
  h2: { fontSize: 22, fontWeight: 650, marginTop: 10, lineHeight: 1.3 },
  h3: { fontSize: 18, fontWeight: 600, marginTop: 6, lineHeight: 1.35 },
  code: { fontSize: 13.5, whiteSpace: "pre-wrap" },
};

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  paragraph: "Digite / para comandos",
  h1: "Título 1",
  h2: "Título 2",
  h3: "Título 3",
  todo: "Tarefa",
  bullet: "Lista",
  numbered: "Lista",
  toggle: "Recolhível",
  quote: "Citação",
  callout: "Destaque",
  code: "Código",
};

/** contentEditable "não controlado": o texto só é escrito no DOM ao montar. */
function Editable({
  block,
  readOnly,
  register,
  onText,
  onKeyDown,
  onPaste,
}: {
  block: Block;
  readOnly: boolean;
  register: (el: HTMLElement | null) => void;
  onText: (t: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLElement>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== block.text && document.activeElement !== ref.current) {
      ref.current.textContent = block.text;
    }
  }, [block.text]);
  useEffect(() => {
    register(ref.current);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      data-placeholder={PLACEHOLDER[block.type] ?? ""}
      className="ws-editable"
      onInput={(e) => onText(e.currentTarget.textContent ?? "")}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      style={{
        outline: "none",
        padding: "3px 2px",
        minHeight: 24,
        fontSize: 15.5,
        lineHeight: 1.55,
        color: "var(--ink)",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        textDecoration: block.type === "todo" && block.checked ? "line-through" : "none",
        opacity: block.type === "todo" && block.checked ? 0.55 : 1,
        ...TEXT_STYLE[block.type],
      }}
    />
  );
}
