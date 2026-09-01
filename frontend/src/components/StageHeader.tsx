export type TabId = "dashboard" | "resumo" | "quiz" | "insights" | "chat";

interface Props {
  subjectName: string;
  topicCount: number;
  lastUpdated: string | null;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onFocusToggle: () => void;
  onThemeToggle: () => void;
  onUpdateClick: () => void;
  generating: boolean;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "dashboard", label: "Painel" },
  { id: "resumo", label: "Resumo" },
  { id: "quiz", label: "Quiz" },
  { id: "insights", label: "Insights" },
  { id: "chat", label: "Chat IA" },
];

function formatLastUpdated(iso: string | null): string {
  if (!iso) return "ainda não processada";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffH = Math.round(diffMs / 3_600_000);
  if (diffH < 1) return "atualizada agora há pouco";
  if (diffH < 24) return `atualizada há ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `atualizada há ${diffD} dia${diffD > 1 ? "s" : ""}`;
}

export default function StageHeader({
  subjectName,
  topicCount,
  lastUpdated,
  activeTab,
  onTabChange,
  onFocusToggle,
  onThemeToggle,
  onUpdateClick,
  generating,
}: Props) {
  return (
    <div className="stage-header">
      <div className="stage-heading">
        <h1>{subjectName}</h1>
        <p className="meta">
          {topicCount} tópico{topicCount === 1 ? "" : "s"} · base {formatLastUpdated(lastUpdated)}
        </p>
      </div>
      <div className="stage-actions">
        <div className="tabs" role="tablist" aria-label="Visualizações da matéria">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className="tab"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="Alternar modo foco" aria-label="Alternar modo foco" onClick={onFocusToggle}>
          ◱
        </button>
        <button className="icon-btn" title="Alternar tema" aria-label="Alternar tema" onClick={onThemeToggle}>
          ◐
        </button>
        <button className="btn btn-primary" onClick={onUpdateClick} disabled={generating}>
          {generating ? "Atualizando..." : "Atualizar matéria"}
        </button>
      </div>
    </div>
  );
}
