import { useEffect, useState } from "react";
import { api } from "../api";
import { DEMO_MODE } from "../demoMode";
import type { Topic } from "../types";

interface Props {
  subject: string | null;
  open: boolean;
  onClose: () => void;
  onCreated: (topic: Topic) => void;
}

export default function NewTopicModal({ subject, open, onClose, onCreated }: Props) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNome("");
      setDescricao("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !subject) return null;

  async function handleCreate() {
    if (!subject || !nome.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const topic = await api.createTopic(subject, nome.trim(), descricao.trim());
      onCreated(topic);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="topicModalTitle">
        <div className="modal-header">
          <h3 id="topicModalTitle">Novo tópico</h3>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        {DEMO_MODE ? (
          <>
            <div className="modal-body">
              <p className="field-hint">Indisponível na demo estática — requer o backend local.</p>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <label className="field-label" htmlFor="topicNameInput">
                Nome do tópico
              </label>
              <input
                id="topicNameInput"
                className="field-input"
                type="text"
                placeholder="Ex.: Séries e Sequências"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                autoFocus
              />

              <label className="field-label" htmlFor="topicDescInput">
                Descrição <span className="field-optional">(opcional)</span>
              </label>
              <textarea
                id="topicDescInput"
                className="field-textarea"
                placeholder="Do que se trata? Ex.: convergência de séries, teste da razão, séries de potências…"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
              <p className="field-hint">Usada pela IA para encaixar automaticamente novos arquivos e questões neste tópico.</p>
              {error && <p className="field-hint" style={{ color: "var(--bad)" }}>{error}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!nome.trim() || saving}>
                {saving ? "Criando..." : "Criar tópico"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
