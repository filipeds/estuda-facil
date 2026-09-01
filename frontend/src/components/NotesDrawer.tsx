import { useEffect, useState } from "react";
import { api } from "../api";
import { DEMO_MODE } from "../demoMode";
import type { NoteEntry, Topic } from "../types";

interface Props {
  subject: string | null;
  topics: Topic[];
  defaultTopicId: string | null;
}

export default function NotesDrawer({ subject, topics, defaultTopicId }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(defaultTopicId);
  const [entries, setEntries] = useState<NoteEntry[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (defaultTopicId && !selectedTopicId) setSelectedTopicId(defaultTopicId);
  }, [defaultTopicId, selectedTopicId]);

  useEffect(() => {
    if (!subject || !selectedTopicId) return;
    let cancelled = false;
    api
      .getNotes(subject, selectedTopicId)
      .then((res) => !cancelled && setEntries(res))
      .catch(() => !cancelled && setEntries([]));
    return () => {
      cancelled = true;
    };
  }, [subject, selectedTopicId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!subject) return null;

  const slug = selectedTopicId ?? "";

  async function handleSave() {
    if (!subject || !selectedTopicId || !text.trim() || saving) return;
    setSaving(true);
    try {
      const entry = await api.addNote(subject, selectedTopicId, text.trim());
      setEntries((prev) => [entry, ...prev]);
      setText("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1100);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className={`notes-tab${open ? " is-hidden" : ""}`}
        aria-expanded={open}
        aria-controls="notesDrawer"
        onClick={() => setOpen(true)}
      >
        Anotações
      </button>

      <aside className={`notes-drawer${open ? " open" : ""}`} id="notesDrawer" aria-hidden={!open}>
        <div className="notes-header">
          <div className="notes-header-top">
            <span className="notes-title">Anotações</span>
            <button className="icon-btn" aria-label="Fechar anotações" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <select
            className="notes-topic-select"
            value={selectedTopicId ?? ""}
            onChange={(e) => setSelectedTopicId(e.target.value)}
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="notes-compose">
          <textarea
            className="notes-textarea"
            placeholder={
              DEMO_MODE
                ? "Indisponível na demo estática — requer o backend local."
                : "Escreva algo enquanto estuda este tópico…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={DEMO_MODE}
          />
          <div className="notes-compose-actions">
            <span className="notes-hint">
              {DEMO_MODE ? "Anotações exigem o backend local." : "Fica salvo mesmo trocando de aba"}
            </span>
            <button className="btn btn-primary" onClick={handleSave} disabled={DEMO_MODE || !text.trim() || saving}>
              {savedFlash ? "Salvo" : "Salvar anotação"}
            </button>
          </div>
        </div>

        <div className="notes-entries">
          <p className="notes-entries-label">Anotações anteriores</p>
          {entries.length === 0 && <p className="notes-hint">Nenhuma anotação ainda neste tópico.</p>}
          {entries.map((entry, i) => (
            <div className="notes-entry" key={`${entry.time}-${i}`}>
              <span className="notes-entry-time">{entry.time}</span>
              <p className="notes-entry-body">{entry.body}</p>
            </div>
          ))}
        </div>

        <div className="notes-footer">
          {subject && slug ? `materias/${subject}/anotacoes/${slug}.md` : ""}
        </div>
      </aside>
    </>
  );
}
