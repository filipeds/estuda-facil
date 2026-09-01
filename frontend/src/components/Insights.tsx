import { useEffect, useState } from "react";
import { api } from "../api";
import { renderMarkdown } from "../markdown";
import type { InsightsResponse } from "../types";

interface Props {
  subject: string;
}

export default function Insights({ subject }: Props) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getInsights(subject)
      .then((res) => !cancelled && setData(res))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subject]);

  if (loading) return <p className="empty-state">Carregando insights...</p>;
  if (!data) return <p className="empty-state">Não foi possível carregar os insights.</p>;

  const { content, progress } = data;

  return (
    <div className="insights-grid">
      <div className="panel">
        <h3>Insights da matéria</h3>
        {content ? (
          <div className="insights-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <p className="notes-hint">
            Nenhum insight gerado ainda. Clique em "Atualizar matéria" para gerar a primeira análise.
          </p>
        )}
      </div>

      <div className="panel">
        <h3>Seu progresso</h3>
        <div className="stat-row">
          <span className="name">Questões respondidas</span>
          <span className="val">{progress.totalQuestoes}</span>
        </div>
        <div className="stat-row">
          <span className="name">Acerto geral</span>
          <span className="val">{progress.acertoGeralPct !== null ? `${progress.acertoGeralPct}%` : "—"}</span>
        </div>
        <div className="stat-row">
          <span className="name">Tópicos dominados</span>
          <span className="val">
            {progress.topicosDominados} de {progress.totalTopicos}
          </span>
        </div>
      </div>
    </div>
  );
}
