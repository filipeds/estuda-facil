import { useEffect, useState } from "react";
import { api } from "../api";
import { renderMarkdownWithToc, type Heading } from "../markdown";
import type { Topic } from "../types";

interface Props {
  subject: string;
  topic: Topic | null;
}

export default function Resumo({ subject, topic }: Props) {
  const [html, setHtml] = useState("");
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    setLoading(true);
    api
      .getResumo(subject, topic.id)
      .then((res) => {
        if (cancelled) return;
        setSources(res.sources);
        if (res.content) {
          const rendered = renderMarkdownWithToc(res.content);
          setHtml(rendered.html);
          setHeadings(rendered.headings);
        } else {
          setHtml("");
          setHeadings([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subject, topic]);

  if (!topic) return <p className="empty-state">Selecione um tópico para ver o resumo.</p>;

  return (
    <div className="reading-layout">
      <article className="reading">
        <header>
          <h2>{topic.nome}</h2>
          <p className="subtitle">
            {sources.length > 0 ? `Resumo gerado a partir de ${sources.join(", ")}` : "Ainda sem material associado."}
          </p>
        </header>

        {loading && <p className="notes-hint">Carregando...</p>}
        {!loading && html && <div className="reading-body" dangerouslySetInnerHTML={{ __html: html }} />}
        {!loading && !html && (
          <p className="notes-hint">
            Nenhum resumo gerado ainda para este tópico. Clique em "Atualizar matéria" depois de adicionar arquivos.
          </p>
        )}
      </article>

      <aside className="side-rail">
        {headings.length > 0 && (
          <div>
            <h4>Nesta página</h4>
            <nav className="toc-list">
              {headings.map((h) => (
                <a key={h.id} className="toc-link" href={`#${h.id}`}>
                  {h.text}
                </a>
              ))}
            </nav>
          </div>
        )}

        <div>
          <h4>Fontes</h4>
          <div className="source-list">
            {sources.length === 0 && <span className="notes-hint">Nenhum arquivo associado ainda.</span>}
            {sources.map((s) => (
              <div className="source-item" key={s}>
                <span className="fdot" />
                {s}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4>Desempenho neste tópico</h4>
          <div className="stat-mini">
            <div className="stat-mini-row">
              <span>Questões respondidas</span>
              <span className="val">{topic.tentativas}</span>
            </div>
            <div className="stat-mini-row">
              <span>Acerto</span>
              <span className="val">{topic.acertoPct !== null ? `${topic.acertoPct}%` : "—"}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
