import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Home,
  ListChecks,
  LockKeyhole,
  Play,
  RotateCcw,
  School,
  ShieldCheck,
  Sparkles,
  Timer,
  XCircle,
} from "lucide-react";
import { difficultyLabels, getSubject, questionBank, subjects } from "./questionBank.js";

const QUESTION_COUNT = 30;
const STORAGE_KEY = "utm-academia-practica-stats";

const readStats = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
};

const saveAttempt = (attempt) => {
  const current = readStats();
  localStorage.setItem(STORAGE_KEY, JSON.stringify([attempt, ...current].slice(0, 25)));
};

function shuffle(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function buildQuiz({ subjectId, unit, difficulty }) {
  const filtered = questionBank.filter((question) => {
    const subjectMatch = subjectId === "all" || question.subjectId === subjectId;
    const unitMatch = unit === "all" || question.unit === Number(unit);
    return subjectMatch && unitMatch && question.difficulty === difficulty;
  });

  const fallback = questionBank.filter((question) => {
    const subjectMatch = subjectId === "all" || question.subjectId === subjectId;
    return subjectMatch && question.difficulty === difficulty;
  });

  const pool = filtered.length >= QUESTION_COUNT ? filtered : fallback;
  return shuffle(pool).slice(0, QUESTION_COUNT).map((question, index) => ({
    ...question,
    id: `${question.subjectId}-${question.difficulty}-${question.unit}-${index}-${question.question.slice(0, 16)}`,
    options: shuffle(
      question.options.map((option, optionIndex) => ({
        text: option,
        isCorrect: optionIndex === question.answer,
      }))
    ),
  }));
}

function scoreQuiz(questions, answers) {
  return questions.reduce((score, question, index) => {
    return score + (answers[index] === question.options.findIndex((option) => option.isCorrect) ? 1 : 0);
  }, 0);
}

function App() {
  const [screen, setScreen] = useState("home");
  const [config, setConfig] = useState({
    subjectId: "all",
    unit: "all",
    difficulty: "intermedio",
  });
  const [quiz, setQuiz] = useState([]);
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [stats, setStats] = useState(readStats);
  const [quizNotice, setQuizNotice] = useState("");

  const selectedSubject = getSubject(config.subjectId);
  const availableUnits = selectedSubject?.units ?? [];
  const completedCount = Object.keys(answers).length;
  const score = quiz.length ? scoreQuiz(quiz, answers) : 0;
  const percentage = quiz.length ? Math.round((score / quiz.length) * 100) : 0;

  const summary = useMemo(() => {
    const attempts = stats.length;
    const average = attempts
      ? Math.round(stats.reduce((total, attempt) => total + attempt.percentage, 0) / attempts)
      : 0;
    const best = attempts ? Math.max(...stats.map((attempt) => attempt.percentage)) : 0;
    return { attempts, average, best };
  }, [stats]);

  const startQuiz = () => {
    const nextQuiz = buildQuiz(config);
    setQuiz(nextQuiz);
    setAnswers({});
    setCurrent(0);
    setQuizNotice("");
    setStartedAt(Date.now());
    setScreen("quiz");
  };

  const finishQuiz = () => {
    if (Object.keys(answers).length < quiz.length) {
      setQuizNotice("Responde todas las preguntas antes de finalizar el cuestionario.");
      return;
    }

    const finalScore = scoreQuiz(quiz, answers);
    const finalPercentage = Math.round((finalScore / quiz.length) * 100);
    const attempt = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      subject: config.subjectId === "all" ? "Banco general" : selectedSubject.name,
      difficulty: difficultyLabels[config.difficulty],
      score: finalScore,
      total: quiz.length,
      percentage: finalPercentage,
      duration: Math.max(1, Math.round((Date.now() - startedAt) / 60000)),
    };

    saveAttempt(attempt);
    setStats(readStats());
    setScreen("results");
  };

  const resetToHome = () => {
    setScreen("home");
    setQuiz([]);
    setAnswers({});
    setCurrent(0);
  };

  return (
    <main className={`app-shell screen-${screen}`}>
      <header className="topbar">
        <button
          className={`brand-button ${screen === "quiz" ? "locked-brand" : ""}`}
          type="button"
          onClick={screen === "quiz" ? undefined : resetToHome}
          aria-label={screen === "quiz" ? "Intento en curso" : "Volver al inicio"}
        >
          <span className="brand-mark">
            <School size={24} />
          </span>
          <span>
            <strong>UTM Academia Practica</strong>
            <small>Universidad Tecnica de Manabi</small>
          </span>
        </button>

        {screen === "quiz" ? (
          <div className="exam-lock">
            <LockKeyhole size={18} />
            Intento en curso
          </div>
        ) : (
          <nav className="topbar-actions" aria-label="Navegacion principal">
            <button type="button" className="ghost-button" onClick={() => setScreen("home")}>
              <Home size={18} />
              Inicio
            </button>
            <button type="button" className="ghost-button" onClick={() => setScreen("progress")}>
              <BarChart3 size={18} />
              Progreso
            </button>
          </nav>
        )}
      </header>

      {screen === "home" && (
        <HomeScreen
          config={config}
          setConfig={setConfig}
          selectedSubject={selectedSubject}
          availableUnits={availableUnits}
          summary={summary}
          startQuiz={startQuiz}
        />
      )}

      {screen === "quiz" && (
        <QuizScreen
          questions={quiz}
          answers={answers}
          setAnswers={setAnswers}
          current={current}
          setCurrent={setCurrent}
          finishQuiz={finishQuiz}
          completedCount={completedCount}
          notice={quizNotice}
          setNotice={setQuizNotice}
        />
      )}

      {screen === "results" && (
        <ResultsScreen
          questions={quiz}
          answers={answers}
          score={score}
          percentage={percentage}
          resetToHome={resetToHome}
          retry={startQuiz}
        />
      )}

      {screen === "progress" && <ProgressScreen stats={stats} summary={summary} resetToHome={resetToHome} />}
    </main>
  );
}

function HomeScreen({ config, setConfig, selectedSubject, availableUnits, summary, startQuiz }) {
  return (
    <>
      <section className="home-dashboard">
        <div className="dashboard-intro">
          <span className="eyebrow">
            <GraduationCap size={18} />
            Preparacion academica universitaria
          </span>
          <h1>Centro de practica UTM</h1>
          <p>Configura tu cuestionario y empieza una practica secuencial de 30 preguntas.</p>
          <div className="intro-proof" aria-label="Resumen del modo de practica">
            <span>30 preguntas</span>
            <span>3 niveles</span>
            <span>Avance protegido</span>
          </div>
        </div>
        <section className="exam-panel" aria-label="Configuracion del cuestionario">
          <div className="panel-heading">
            <div>
              <span>Configurar practica</span>
              <strong>Simulador evaluativo</strong>
            </div>
            <Sparkles size={22} />
          </div>

          <label className="field">
            <span>Materia</span>
            <select
              value={config.subjectId}
              onChange={(event) =>
                setConfig((current) => ({ ...current, subjectId: event.target.value, unit: "all" }))
              }
            >
              <option value="all">Todas las materias</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Unidad</span>
            <select
              value={config.unit}
              disabled={!selectedSubject}
              onChange={(event) => setConfig((current) => ({ ...current, unit: event.target.value }))}
            >
              <option value="all">Todas las unidades</option>
              {availableUnits.map((unit, index) => (
                <option key={unit} value={index + 1}>
                  Unidad {index + 1}: {unit}
                </option>
              ))}
            </select>
          </label>

          <div className="field">
            <span>Dificultad</span>
            <div className="segmented" role="group" aria-label="Seleccionar dificultad">
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={config.difficulty === value ? "active" : ""}
                  onClick={() => setConfig((current) => ({ ...current, difficulty: value }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="exam-summary-card" aria-label="Resumen del intento">
            <div>
              <strong>Intento academico</strong>
              <span>Sin registro - retroalimentacion al finalizar</span>
            </div>
            <span className="question-count">30</span>
          </div>

          <button className="primary-button" type="button" onClick={startQuiz}>
            <Play size={20} />
            Iniciar cuestionario
          </button>
        </section>
      </section>

    </>
  );
}

function Metric({ icon: Icon, value, label }) {
  return (
    <div className="metric">
      <Icon size={20} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function QuizScreen({
  questions,
  answers,
  setAnswers,
  current,
  setCurrent,
  finishQuiz,
  completedCount,
  notice,
  setNotice,
}) {
  const question = questions[current];
  const progress = Math.round((completedCount / questions.length) * 100);
  const selected = answers[current];
  const currentAnswered = selected !== undefined;
  const [coachMode, setCoachMode] = useState("enunciado");
  const fallbackHint = buildQuestionHint(question, coachMode);
  const [coachResponse, setCoachResponse] = useState({
    text: fallbackHint,
    source: "local",
    loading: false,
  });
  const analysisHint = coachResponse.loading ? "Analizando la pregunta con el asistente IA..." : coachResponse.text;

  useEffect(() => {
    const controller = new AbortController();
    const fallback = buildQuestionHint(question, coachMode);

    setCoachResponse({ text: fallback, source: "local", loading: true });

    requestAiCoach(question, coachMode, controller.signal)
      .then((text) => {
        setCoachResponse({
          text: text || fallback,
          source: text ? "ia" : "local",
          loading: false,
        });
      })
      .catch(() => {
        setCoachResponse({ text: fallback, source: "local", loading: false });
      });

    return () => controller.abort();
  }, [question, coachMode]);

  const goNext = () => {
    if (!currentAnswered) {
      setNotice("Selecciona una respuesta para continuar con la siguiente pregunta.");
      return;
    }

    setNotice("");
    setCurrent(current + 1);
  };

  const selectAnswer = (index) => {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [current]: index }));
    setNotice("");
  };

  return (
    <section className="quiz-layout">
      <aside className="quiz-sidebar">
        <div className="quiz-status">
          <span>Progreso</span>
          <strong>
            {completedCount}/{questions.length}
          </strong>
          <div className="progress-track">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="security-note">
          <ShieldCheck size={20} />
          <div>
            <strong>Intento protegido</strong>
            <span>El avance es secuencial. Responde la pregunta actual para continuar.</span>
          </div>
        </div>

        <div className="question-map">
          {questions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`${index === current ? "current" : ""} ${answers[index] !== undefined ? "answered" : ""} locked`}
              disabled
              aria-label={`Estado de pregunta ${index + 1}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </aside>

      <article className="question-panel">
        <div className={`robot-coach ${coachResponse.loading ? "thinking" : ""}`} aria-label="Asistente de analisis">
          <div className="robot-avatar" aria-hidden="true">
            <span className="robot-antenna" />
            <span className="robot-head">
              <span className="robot-eye" />
              <span className="robot-eye" />
            </span>
            <span className="robot-body" />
          </div>
          <div className="robot-message">
            <span>Asistente de analisis · {coachResponse.source === "ia" ? "IA online" : "modo local"}</span>
            <p>{analysisHint}</p>
            <div className="coach-actions" role="group" aria-label="Modos de ayuda del asistente">
              {[
                ["enunciado", "Enunciado"],
                ["descarte", "Descartar"],
                ["concepto", "Concepto"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  className={coachMode === mode ? "active" : ""}
                  onClick={() => setCoachMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="question-meta">
          <span>{getSubject(question.subjectId).name}</span>
          <span>Unidad {question.unit}</span>
          <span>{difficultyLabels[question.difficulty]}</span>
        </div>

        <h2>
          <span>Pregunta {current + 1}</span>
          {question.question}
        </h2>

        <div className="options-list">
          {question.options.map((option, index) => (
            <button
              key={option.text}
              type="button"
              className={selected === index ? "selected" : ""}
              onClick={() => selectAnswer(index)}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              {option.text}
            </button>
          ))}
        </div>

        <div className={`validation-message ${notice ? "visible" : ""}`} role="status" aria-live="polite">
          <LockKeyhole size={18} />
          <span>{notice || "Pregunta validada para avance secuencial."}</span>
        </div>

        <footer className="quiz-controls">
          <div className="locked-progress">
            <LockKeyhole size={18} />
            Pregunta {current + 1} de {questions.length}
          </div>

          {current < questions.length - 1 ? (
            <button type="button" className="primary-button" onClick={goNext}>
              Siguiente
              <ChevronRight size={18} />
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={finishQuiz}>
              <CheckCircle2 size={18} />
              Finalizar
            </button>
          )}
        </footer>
      </article>
    </section>
  );
}

async function requestAiCoach(question, mode, signal) {
  const response = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      mode,
      subject: getSubject(question.subjectId)?.name,
      unit: question.unit,
      difficulty: difficultyLabels[question.difficulty],
      question: question.question,
      options: question.options.map((option) => option.text),
    }),
  });

  if (!response.ok) {
    return "";
  }

  const data = await response.json();
  return typeof data.hint === "string" ? data.hint.trim() : "";
}

function buildQuestionHint(question, mode) {
  const subject = getSubject(question.subjectId);
  const concept = extractLikelyConcept(question.question);

  const subjectHints = {
    web: {
      enunciado: "Ubica si el caso pertenece al cliente, servidor, arquitectura o despliegue.",
      descarte: "Descarta opciones que mezclen capas o prometan automatizacion total.",
      concepto: "Relaciona el concepto con su responsabilidad principal en la aplicacion.",
    },
    redes: {
      enunciado: "Identifica si se habla de acceso, transporte, enrutamiento, virtualizacion o QoS.",
      descarte: "Descarta opciones que confundan capas, protocolos o prioridad de trafico.",
      concepto: "El concepto debe conservar su proposito dentro de la red.",
    },
    software: {
      enunciado: "Distingue si el caso trata de requerimientos, proceso, metodologia agil o diseno.",
      descarte: "Descarta opciones con ambiguedad, poca trazabilidad o falta de validacion.",
      concepto: "El concepto debe aportar control, claridad o mantenibilidad.",
    },
    mineria: {
      enunciado: "Determina si el problema es preparacion, prediccion, agrupamiento, texto o datos espaciales.",
      descarte: "Descarta opciones que mezclen modelos, metricas o etapas del proceso.",
      concepto: "El concepto debe coincidir con el dato y el objetivo del analisis.",
    },
    embebidos: {
      enunciado: "Relaciona el caso con hardware, software, comunicacion o restricciones.",
      descarte: "Descarta opciones que ignoren energia, tiempo, memoria o perifericos.",
      concepto: "El concepto debe explicar una funcion hardware-software concreta.",
    },
  };

  const base =
    subjectHints[question.subjectId]?.[mode] ??
    "Lee el enunciado con calma y busca la opcion que mantenga coherencia tecnica con el concepto evaluado.";

  if (mode === "enunciado") {
    return `${base} Enfocate en "${concept}" y en la accion que pide el enunciado.`;
  }

  if (mode === "descarte") {
    return `${base} Compara el proposito tecnico, no solo palabras conocidas.`;
  }

  return `${base} Define "${concept}" y verifica que la opcion no contradiga su funcion.`;
}

function extractLikelyConcept(text) {
  const cleaned = text
    .replace(/[?¿.,:;]/g, "")
    .split(" ")
    .filter((word) => word.length > 3 && !["cual", "cuando", "porque", "dentro", "correctamente", "aplicacion"].includes(word.toLowerCase()));

  return cleaned.slice(-3).join(" ") || "el concepto central";
}

function ResultsScreen({ questions, answers, score, percentage, resetToHome, retry }) {
  const passed = percentage >= 70;

  return (
    <section className="results-layout">
      <div className={`score-card ${passed ? "passed" : "review"}`}>
        {passed ? <CheckCircle2 size={42} /> : <XCircle size={42} />}
        <span>Resultado del cuestionario</span>
        <strong>{percentage}%</strong>
        <p>
          Obtuviste {score} de {questions.length} respuestas correctas. Revisa las explicaciones para reforzar los
          temas donde hubo error.
        </p>
        <div className="result-actions">
          <button type="button" className="primary-button" onClick={retry}>
            <RotateCcw size={18} />
            Nuevo intento
          </button>
          <button type="button" className="secondary-button" onClick={resetToHome}>
            <Home size={18} />
            Inicio
          </button>
        </div>
      </div>

      <div className="review-list">
        {questions.map((question, index) => {
          const correctIndex = question.options.findIndex((option) => option.isCorrect);
          const selectedIndex = answers[index];
          const isCorrect = selectedIndex === correctIndex;

          return (
            <article key={question.id} className={`review-item ${isCorrect ? "correct" : "wrong"}`}>
              <div className="review-heading">
                <span>{index + 1}</span>
                <strong>{question.question}</strong>
              </div>
              <p>
                Tu respuesta: {selectedIndex === undefined ? "Sin responder" : question.options[selectedIndex].text}
              </p>
              {!isCorrect && <p>Respuesta correcta: {question.options[correctIndex].text}</p>}
              <small>{question.explanation}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ProgressScreen({ stats, summary, resetToHome }) {
  return (
    <section className="progress-page">
      <div className="section-heading">
        <div>
          <span>Seguimiento local</span>
          <h1>Progreso de practica</h1>
        </div>
        <button type="button" className="secondary-button" onClick={resetToHome}>
          <Home size={18} />
          Inicio
        </button>
      </div>

      <div className="insight-band">
        <Metric icon={Award} value={`${summary.best}%`} label="Mejor resultado" />
        <Metric icon={BarChart3} value={`${summary.average}%`} label="Promedio" />
        <Metric icon={Timer} value={String(summary.attempts)} label="Intentos" />
      </div>

      <div className="attempt-table" role="table" aria-label="Intentos recientes">
        <div className="attempt-row head" role="row">
          <span>Fecha</span>
          <span>Materia</span>
          <span>Nivel</span>
          <span>Nota</span>
          <span>Tiempo</span>
        </div>
        {stats.length === 0 ? (
          <div className="empty-state">
            <ListChecks size={34} />
            <p>Aun no hay intentos guardados. Inicia un cuestionario para registrar tu progreso.</p>
          </div>
        ) : (
          stats.map((attempt) => (
            <div className="attempt-row" role="row" key={attempt.id}>
              <span className="attempt-date">{new Date(attempt.date).toLocaleDateString("es-EC")}</span>
              <span className="attempt-subject">{attempt.subject}</span>
              <span className="attempt-level">{attempt.difficulty}</span>
              <strong className="attempt-score">{attempt.percentage}%</strong>
              <span className="attempt-time">{attempt.duration} min</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default App;
