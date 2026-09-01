import { useEffect, useState } from "react";
import { api, streamGenerate } from "./api";
import Sidebar from "./components/Sidebar";
import StageHeader, { type TabId } from "./components/StageHeader";
import Dashboard from "./components/Dashboard";
import Resumo from "./components/Resumo";
import Quiz from "./components/Quiz";
import Insights from "./components/Insights";
import OpencodeChat from "./components/OpencodeChat";
import NotesDrawer from "./components/NotesDrawer";
import NewTopicModal from "./components/NewTopicModal";
import type { GenerateProgressEvent, SubjectSummary, Topic } from "./types";

export default function App() {
  const [subjects, setSubjects] = useState<SubjectSummary[]>([]);
  const [activeSubjectId, setActiveSubjectId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [focusMode, setFocusMode] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progressLog, setProgressLog] = useState<GenerateProgressEvent[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    api.listSubjects().then((list) => {
      setSubjects(list);
      if (list.length > 0) setActiveSubjectId((prev) => prev ?? list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!activeSubjectId) return;
    api.listTopics(activeSubjectId).then((list) => {
      setTopics(list);
      setActiveTopicId((prev) => (prev && list.some((t) => t.id === prev) ? prev : (list[0]?.id ?? null)));
    });
  }, [activeSubjectId]);

  function selectSubject(id: string) {
    setActiveSubjectId(id);
    setActiveTopicId(null);
    setActiveTab("dashboard");
  }

  function openTopic(topicId: string) {
    setActiveTopicId(topicId);
    setActiveTab("resumo");
  }

  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = current ? current === "dark" : prefersDark;
    root.setAttribute("data-theme", isDark ? "light" : "dark");
  }

  function refreshSubjects() {
    api.listSubjects().then(setSubjects);
  }

  function handleUpdateClick() {
    if (!activeSubjectId || generating) return;
    setGenerating(true);
    setProgressLog([]);
    setGenerateError(null);
    streamGenerate(
      activeSubjectId,
      (event) => setProgressLog((prev) => [...prev, event]),
      (updatedTopics) => {
        setTopics(updatedTopics);
        setGenerating(false);
        refreshSubjects();
      },
      (message) => {
        setGenerateError(message);
        setGenerating(false);
      },
    );
  }

  function handleTopicCreated(topic: Topic) {
    setTopics((prev) => [...prev, topic]);
    setActiveTopicId(topic.id);
    refreshSubjects();
  }

  const activeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const activeTopic = topics.find((t) => t.id === activeTopicId) ?? null;

  return (
    <div className={`app${focusMode ? " focus-mode" : ""}`}>
      <Sidebar
        subjects={subjects}
        activeSubject={activeSubjectId}
        onSelectSubject={selectSubject}
        topics={topics}
        activeTopicId={activeTopicId}
        onSelectTopic={setActiveTopicId}
        onAddTopicClick={() => setTopicModalOpen(true)}
      />

      <main className="stage">
        {activeSubject ? (
          <>
            <StageHeader
              subjectName={activeSubject.nome}
              topicCount={topics.length}
              lastUpdated={activeSubject.lastUpdated}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onFocusToggle={() => setFocusMode((v) => !v)}
              onThemeToggle={toggleTheme}
              onUpdateClick={handleUpdateClick}
              generating={generating}
            />

            {(generating || progressLog.length > 0 || generateError) && (
              <div className={`progress-log${generateError ? " error" : ""}`}>
                {progressLog.map((e, i) => (
                  <div key={i}>
                    <span className="step">{e.step}</span>
                    {e.detail}
                  </div>
                ))}
                {generateError && <div>{generateError}</div>}
              </div>
            )}

            {activeTab === "dashboard" && (
              <Dashboard
                subject={activeSubject.id}
                topics={topics}
                onOpenTopic={openTopic}
                onAddTopicClick={() => setTopicModalOpen(true)}
              />
            )}
            {activeTab === "resumo" && <Resumo subject={activeSubject.id} topic={activeTopic} />}
            {activeTab === "quiz" && <Quiz subject={activeSubject.id} topic={activeTopic} />}
            {activeTab === "insights" && <Insights subject={activeSubject.id} />}
            {activeTab === "chat" && <OpencodeChat subject={activeSubject.id} />}
          </>
        ) : (
          <p className="empty-state">
            Nenhuma matéria encontrada. Crie uma pasta em <code>materias/</code> com subpastas{" "}
            <code>aulas/</code> e <code>atividades/</code>.
          </p>
        )}
      </main>

      <NotesDrawer subject={activeSubjectId} topics={topics} defaultTopicId={activeTopicId} />

      <NewTopicModal
        subject={activeSubjectId}
        open={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        onCreated={handleTopicCreated}
      />
    </div>
  );
}
