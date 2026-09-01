import { useEffect, useState } from "react";
import { api } from "../api";
import type { QuizQuestion, Topic } from "../types";

interface Props {
  subject: string;
  topic: Topic | null;
}

interface AnsweredState {
  selectedOptionId: string;
  correct: boolean;
  respostaCorreta: string;
  explicacao: string;
}

export default function Quiz({ subject, topic }: Props) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnsweredState>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!topic) return;
    let cancelled = false;
    setLoading(true);
    setAnswers({});
    setIndex(0);
    api
      .getQuiz(subject, topic.id)
      .then((qs) => !cancelled && setQuestions(qs))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [subject, topic]);

  if (!topic) return <p className="empty-state">Selecione um tópico para responder o quiz.</p>;
  if (loading) return <p className="empty-state">Carregando quiz...</p>;
  if (questions.length === 0) {
    return (
      <p className="empty-state">
        Nenhum quiz gerado ainda para este tópico. Clique em "Atualizar matéria" depois de adicionar arquivos.
      </p>
    );
  }

  const question = questions[index];
  const answered = answers[question.id];

  async function handleSelect(optionId: string) {
    if (answered || submitting || !topic) return;
    setSubmitting(true);
    try {
      const result = await api.submitAttempt(subject, topic.id, question.id, optionId);
      setAnswers((prev) => ({
        ...prev,
        [question.id]: { selectedOptionId: optionId, ...result },
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="quiz-layout">
      <div className="quiz-wrap">
        <div className="quiz-progress">
          <span>
            Questão {index + 1} de {questions.length}
          </span>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
          </div>
        </div>

        <p className="quiz-question">{question.pergunta}</p>

        <div className="options">
          {question.opcoes.map((opt, i) => {
            let cls = "option";
            if (answered) {
              if (opt.id === answered.respostaCorreta) cls += " correct";
              else if (opt.id === answered.selectedOptionId) cls += " incorrect";
            }
            return (
              <button key={opt.id} className={cls} onClick={() => handleSelect(opt.id)} disabled={!!answered}>
                <span className="letter">{String.fromCharCode(65 + i)}</span>
                <span>{opt.texto}</span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="explain">
            <strong>{answered.correct ? "Certa!" : "Quase."}</strong> {answered.explicacao}
          </div>
        )}

        <div className="stage-actions" style={{ marginTop: 18 }}>
          <button className="btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            Anterior
          </button>
          <button
            className="btn btn-primary"
            disabled={index === questions.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Próxima
          </button>
        </div>
      </div>

      <aside className="side-rail">
        <div>
          <h4>Questões</h4>
          <div className="qnav">
            {questions.map((q, i) => {
              const a = answers[q.id];
              let cls = "qnav-item";
              if (a) cls += a.correct ? " done-good" : " done-bad";
              else if (i === index) cls += " current";
              return (
                <button key={q.id} className={cls} onClick={() => setIndex(i)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="qnav-legend">
            <span>
              <span className="swatch" style={{ background: "var(--good)" }} />
              Correta
            </span>
            <span>
              <span className="swatch" style={{ background: "var(--bad)" }} />
              Incorreta
            </span>
            <span>
              <span className="swatch" style={{ background: "var(--line)" }} />
              Pendente
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
