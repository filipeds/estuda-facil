import type { SubjectSummary, Topic } from "../types";

interface Props {
  subjects: SubjectSummary[];
  activeSubject: string | null;
  onSelectSubject: (id: string) => void;
  topics: Topic[];
  activeTopicId: string | null;
  onSelectTopic: (id: string) => void;
  onAddTopicClick: () => void;
}

export default function Sidebar({
  subjects,
  activeSubject,
  onSelectSubject,
  topics,
  activeTopicId,
  onSelectTopic,
  onAddTopicClick,
}: Props) {
  const activeSubjectName = subjects.find((s) => s.id === activeSubject)?.nome ?? "";

  return (
    <aside className="rail">
      <div className="brand">
        <span className="brand-mark">Estuda Fácil</span>
      </div>

      <div>
        <p className="rail-label">Matérias</p>
        <nav className="subjects">
          {subjects.map((s) => (
            <button
              key={s.id}
              className={`subject-item${s.id === activeSubject ? " active" : ""}`}
              onClick={() => onSelectSubject(s.id)}
            >
              <span>{s.nome}</span>
              <span className="subject-count">{s.topicCount}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="rail-divider" />

      <div>
        <div className="rail-label-row">
          <p className="rail-label">Tópicos{activeSubjectName ? ` · ${activeSubjectName}` : ""}</p>
          <button className="rail-add-btn" title="Novo tópico" aria-label="Criar novo tópico" onClick={onAddTopicClick}>
            +
          </button>
        </div>
        <nav className="topics">
          {topics.map((t) => (
            <button
              key={t.id}
              className={`topic-row${t.id === activeTopicId ? " current" : ""}`}
              onClick={() => onSelectTopic(t.id)}
            >
              <span className={`dot ${t.status}`} />
              <span className="name">{t.nome}</span>
              <span className="pct">{t.acertoPct !== null ? `${t.acertoPct}%` : "—"}</span>
            </button>
          ))}
          {topics.length === 0 && (
            <p className="notes-hint" style={{ padding: "6px 10px" }}>
              Nenhum tópico ainda.
            </p>
          )}
        </nav>
      </div>
    </aside>
  );
}
