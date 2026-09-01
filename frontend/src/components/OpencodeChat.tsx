import { useEffect, useRef, useState } from "react";
import { api, streamOpencodeLog } from "../api";
import type { OpencodeLogEntry } from "../types";

interface Props {
  subject: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function OpencodeChat({ subject }: Props) {
  const [entries, setEntries] = useState<OpencodeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    api
      .getOpencodeLog(subject)
      .then((list) => !cancelled && setEntries(list))
      .finally(() => !cancelled && setLoading(false));

    const stop = streamOpencodeLog(subject, (entry) => {
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [subject]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [entries.length]);

  if (loading) return <p className="empty-state">Carregando conversas com a IA...</p>;

  if (entries.length === 0) {
    return (
      <p className="empty-state">
        Nenhuma conversa registrada ainda nesta matéria. Clique em "Atualizar matéria" — cada pedido feito
        ao opencode e a resposta dele aparecem aqui, em tempo real.
      </p>
    );
  }

  return (
    <div className="chat-log">
      {entries.map((entry) => (
        <div key={entry.id} className="chat-turn">
          <div className="chat-turn-meta">
            <span className="chat-kind">{entry.kind}</span>
            <span className="chat-time">
              {formatTime(entry.timestamp)} · {entry.durationMs}ms
            </span>
          </div>
          <div className="chat-bubble chat-request">
            <span className="chat-role">Enviado ao opencode</span>
            <pre>{entry.request}</pre>
          </div>
          <div className={`chat-bubble chat-response${entry.error ? " chat-error" : ""}`}>
            <span className="chat-role">{entry.error ? "Erro" : "Resposta"}</span>
            <pre>{entry.error ?? entry.response}</pre>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
