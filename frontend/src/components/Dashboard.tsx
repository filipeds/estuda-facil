import { useEffect, useState } from "react";
import { api } from "../api";
import type { ChartDatum, Topic } from "../types";

interface Props {
  subject: string;
  topics: Topic[];
  onOpenTopic: (topicId: string) => void;
  onAddTopicClick: () => void;
}

function ChartPanel({ title, sub, data, unit }: { title: string; sub: string; data: ChartDatum[]; unit: string }) {
  const max = Math.max(1, ...data.map((d) => d.valor));
  return (
    <div className="panel chart-panel">
      <h3>{title}</h3>
      <span className="chart-sub">{sub}</span>
      <div className="chart-rows">
        {data.map((d) => (
          <div className="chart-row" key={d.id} title={`${d.nome}: ${d.valor} ${unit}`}>
            <span className="clabel">{d.nome}</span>
            <div className="ctrack">
              <div className="cfill" style={{ width: `${(d.valor / max) * 100}%` }} />
            </div>
            <span className="cval">{d.valor}</span>
          </div>
        ))}
        {data.length === 0 && <p className="notes-hint">Sem dados ainda.</p>}
      </div>
    </div>
  );
}

export default function Dashboard({ subject, topics, onOpenTopic, onAddTopicClick }: Props) {
  const [maisEstudados, setMaisEstudados] = useState<ChartDatum[]>([]);
  const [maisMencionados, setMaisMencionados] = useState<ChartDatum[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getInsights(subject)
      .then((res) => {
        if (cancelled) return;
        setMaisEstudados(res.maisEstudados);
        setMaisMencionados(res.maisMencionados);
      })
      .catch(() => {
        if (!cancelled) {
          setMaisEstudados([]);
          setMaisMencionados([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subject, topics]);

  const weakest = topics
    .filter((t) => t.tentativas > 0 && t.acertoPct !== null)
    .sort((a, b) => (a.acertoPct ?? 0) - (b.acertoPct ?? 0))[0];

  return (
    <section>
      {weakest && (
        <div className="insight-strip">
          <span className="label">Insight</span>
          <span>
            <strong>{weakest.nome}</strong> está com {weakest.acertoPct}% de acerto — vale revisar antes da prova.
          </span>
        </div>
      )}

      <div className="topic-grid">
        {topics.map((t) => (
          <button key={t.id} className="topic-card" onClick={() => onOpenTopic(t.id)}>
            <div className="topic-card-top">
              <h3>{t.nome}</h3>
              <span className={`chip ${t.status}`}>{t.statusLabel}</span>
            </div>
            <div className="bar">
              <div
                className={`bar-fill ${t.status === "good" ? "good" : t.status === "warn" ? "warn" : ""}`}
                style={{ width: `${t.acertoPct ?? 0}%` }}
              />
            </div>
            <p className="topic-card-meta">
              {t.tentativas > 0
                ? `${t.tentativas} questões · ${t.acertoPct}% de acerto`
                : t.arquivos.length > 0
                  ? `Gerado a partir de ${t.arquivos.length} arquivo${t.arquivos.length > 1 ? "s" : ""}`
                  : t.origem === "manual"
                    ? "Criado manualmente · aguardando conteúdo"
                    : "Aguardando conteúdo"}
            </p>
          </button>
        ))}

        <div
          className="topic-card add-card"
          role="button"
          tabIndex={0}
          aria-label="Criar novo tópico"
          onClick={onAddTopicClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddTopicClick();
            }
          }}
        >
          <div className="add-card-inner">
            <span className="add-icon">+</span>
            <span>Novo tópico</span>
          </div>
        </div>
      </div>

      {topics.length > 0 && (
        <div className="chart-row-grid">
          <ChartPanel
            title="Tópicos mais estudados"
            sub="Questões de quiz respondidas, por tópico"
            data={maisEstudados}
            unit="questões respondidas"
          />
          <ChartPanel
            title="Tópicos mais mencionados no material"
            sub="Ocorrências identificadas nas aulas e atividades enviadas"
            data={maisMencionados}
            unit="menções no material"
          />
        </div>
      )}
    </section>
  );
}
