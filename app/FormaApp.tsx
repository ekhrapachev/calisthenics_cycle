"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  EXERCISE_CATALOG,
  EXERCISES_BY_KEY,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/workout-catalog";

type User = {
  id: string;
  email: string;
  name: string;
  gender: string;
  birthDate: string;
};

type Effort = "easy" | "reserve" | "hard";
type Difficulty = "easy" | "medium" | "hard";
type Screen =
  | "home"
  | "routines"
  | "routine"
  | "routineEdit"
  | "exercise"
  | "rest"
  | "summary"
  | "history"
  | "profile";
type AuthScreen = "email" | "login" | "register" | "forgot";

type Routine = {
  id: string;
  name: string;
  durationMinutes: number;
  difficulty: Difficulty;
  exerciseKeys: string[];
  createdAt?: number;
  updatedAt?: number;
};

type RoutineDraft = {
  id: string | null;
  name: string;
  durationMinutes: number;
  difficulty: Difficulty;
  exerciseKeys: string[];
};

type HistoryItem = {
  id: string;
  routineName: string;
  completedAt: number;
  durationSeconds: number;
  setCount: number;
};

const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "Что-то пошло не так");
  }
  return body as T;
};

const durationLabel = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} мин`;
const dateLabel = (value: number) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));
const difficultyLabel: Record<Difficulty, string> = {
  easy: "Лёгкая",
  medium: "Средняя",
  hard: "Высокая",
};
const exerciseCountLabel = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} упражнений`;
  if (mod10 === 1) return `${count} упражнение`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} упражнения`;
  return `${count} упражнений`;
};

export default function FormaApp() {
  const screenContentRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authScreen, setAuthScreen] = useState<AuthScreen>("email");
  const [screen, setScreen] = useState<Screen>("home");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState("unspecified");
  const [birthDate, setBirthDate] = useState("");
  const [homeMenuOpen, setHomeMenuOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [progressions, setProgressions] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Exercise | null>(null);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [routineReturnScreen, setRoutineReturnScreen] = useState<"home" | "routines">("home");
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [editReturnScreen, setEditReturnScreen] = useState<"home" | "routines" | "routine">("routine");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<"all" | ExerciseCategory>("all");
  const [catalogSelection, setCatalogSelection] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [activeRoutineName, setActiveRoutineName] = useState("");
  const [activeExercises, setActiveExercises] = useState<Exercise[]>([]);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [actualValue, setActualValue] = useState(1);
  const [restSeconds, setRestSeconds] = useState(120);
  const [lastSet, setLastSet] = useState<{ exercise: Exercise; setNumber: number; actualValue: number } | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [summary, setSummary] = useState<{ durationSeconds: number; setCount: number } | null>(null);

  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId) ?? null;
  const currentExercise = activeExercises[exerciseIndex];
  const progressionFor = (exercise: Exercise) => exercise.defaultProgression;
  const routineProgressionFor = (exercise: Exercise, routineId = selectedRoutineId) =>
    routineId ? progressions[`routine:${routineId}:${exercise.key}`] || exercise.defaultProgression : exercise.defaultProgression;
  const draftExercises = draft
    ? draft.exerciseKeys.map((key) => EXERCISES_BY_KEY[key]).filter((exercise): exercise is Exercise => Boolean(exercise))
    : [];
  const filteredCatalog = EXERCISE_CATALOG.filter((exercise) => {
    const matchesCategory = catalogCategory === "all" || exercise.category === catalogCategory;
    const query = catalogSearch.trim().toLocaleLowerCase("ru-RU");
    return matchesCategory && (!query || `${exercise.name} ${exercise.muscles}`.toLocaleLowerCase("ru-RU").includes(query));
  });

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ routines: Routine[] }>("/api/routines"),
      api<{ progressions: { workoutType: string; exerciseKey: string; progression: string }[] }>("/api/progressions"),
      api<{
        active: {
          id: string;
          routineName: string;
          exercises: Exercise[];
          workoutType: string;
        } | null;
        history: HistoryItem[];
      }>("/api/workouts"),
    ])
      .then(([routineData, progressionData, workoutData]) => {
        setRoutines(routineData.routines);
        const nextProgressions: Record<string, string> = {};
        progressionData.progressions.forEach((item) => {
          nextProgressions[`${item.workoutType}:${item.exerciseKey}`] = item.progression;
        });
        setProgressions(nextProgressions);
        setHistory(workoutData.history);
        if (workoutData.active) {
          setActiveWorkoutId(workoutData.active.id);
          setActiveRoutineName(workoutData.active.routineName);
          setActiveExercises(workoutData.active.exercises);
        }
      })
      .catch((reason: Error) => setError(reason.message));
  }, [user]);

  useEffect(() => {
    if (screen !== "rest" || restSeconds <= 0) return;
    const timer = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, restSeconds]);

  useEffect(() => {
    screenContentRef.current?.scrollTo({ top: 0 });
  }, [screen]);

  const stats = useMemo(() => {
    const total = history.length;
    const streak = history.length ? Math.min(history.length, 6) : 0;
    return { total, streak };
  }, [history]);

  const currentCycleWorkout = (stats.total % 12) + 1;

  const authSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim()) return setError("Введите почту");
    if (authScreen === "email") return;
    setBusy(true);
    try {
      if (authScreen === "forgot") {
        await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setNotice("Если аккаунт существует, инструкция придёт на почту");
        return;
      }
      const endpoint = authScreen === "login" ? "login" : "register";
      const payload =
        authScreen === "login"
          ? { email, password }
          : { email, password, name, gender, birthDate };
      const result = await api<{ user: User }>(`/api/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setUser(result.user);
      setScreen("home");
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось продолжить");
    } finally {
      setBusy(false);
    }
  };

  const openRoutine = (routine: Routine, returnScreen: "home" | "routines") => {
    setSelectedRoutineId(routine.id);
    setRoutineReturnScreen(returnScreen);
    setScreen("routine");
  };

  const chooseProgression = async (exercise: Exercise, progression: string) => {
    if (!selectedRoutine) return;
    const workoutType = `routine:${selectedRoutine.id}`;
    const key = `${workoutType}:${exercise.key}`;
    const previous = progressions[key];
    setProgressions((items) => ({ ...items, [key]: progression }));
    setPicker(null);
    try {
      await api("/api/progressions", {
        method: "PUT",
        body: JSON.stringify({ workoutType, exerciseKey: exercise.key, progression }),
      });
    } catch (reason) {
      setProgressions((items) => ({ ...items, [key]: previous || exercise.defaultProgression }));
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить прогрессию");
    }
  };

  const createRoutine = (returnScreen: "home" | "routines") => {
    setDraft({
      id: null,
      name: "",
      durationMinutes: 30,
      difficulty: "medium",
      exerciseKeys: [],
    });
    setEditReturnScreen(returnScreen);
    setScreen("routineEdit");
    setError("");
  };

  const editRoutine = () => {
    if (!selectedRoutine) return;
    setDraft({
      id: selectedRoutine.id,
      name: selectedRoutine.name,
      durationMinutes: selectedRoutine.durationMinutes,
      difficulty: selectedRoutine.difficulty,
      exerciseKeys: [...selectedRoutine.exerciseKeys],
    });
    setEditReturnScreen("routine");
    setScreen("routineEdit");
    setError("");
  };

  const cancelEdit = () => {
    setDraft(null);
    setScreen(editReturnScreen);
  };

  const saveRoutine = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setError("Введите название набора");
    if (draft.exerciseKeys.length === 0) return setError("Добавьте хотя бы одно упражнение");
    setBusy(true);
    setError("");
    try {
      const result = await api<{ routine: Routine }>(
        draft.id ? `/api/routines/${draft.id}` : "/api/routines",
        {
          method: draft.id ? "PUT" : "POST",
          body: JSON.stringify(draft),
        },
      );
      setRoutines((items) => {
        if (draft.id) {
          return items.map((item) => item.id === draft.id ? { ...item, ...result.routine } : item);
        }
        return [...items, result.routine];
      });
      setSelectedRoutineId(result.routine.id);
      if (editReturnScreen !== "routine") {
        setRoutineReturnScreen(editReturnScreen);
      }
      setDraft(null);
      setScreen("routine");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить набор");
    } finally {
      setBusy(false);
    }
  };

  const deleteRoutine = async () => {
    if (!selectedRoutine) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/routines/${selectedRoutine.id}`, { method: "DELETE" });
      setRoutines((items) => items.filter((item) => item.id !== selectedRoutine.id));
      setSelectedRoutineId(null);
      setDeleteConfirmOpen(false);
      setScreen(routineReturnScreen);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось удалить набор");
    } finally {
      setBusy(false);
    }
  };

  const moveDraftExercise = (index: number, direction: -1 | 1) => {
    if (!draft) return;
    const target = index + direction;
    if (target < 0 || target >= draft.exerciseKeys.length) return;
    const next = [...draft.exerciseKeys];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, exerciseKeys: next });
  };

  const openCatalog = () => {
    setCatalogSelection([]);
    setCatalogSearch("");
    setCatalogCategory("all");
    setCatalogOpen(true);
  };

  const addCatalogExercises = () => {
    if (!draft || catalogSelection.length === 0) return;
    setDraft({ ...draft, exerciseKeys: [...draft.exerciseKeys, ...catalogSelection] });
    setCatalogOpen(false);
    setCatalogSelection([]);
  };

  const startWorkout = async () => {
    if (!selectedRoutine && !activeWorkoutId) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        workout: {
          id: string;
          routineName: string;
          exercises: Exercise[];
        };
      }>("/api/workouts", {
        method: "POST",
        body: JSON.stringify({ routineId: selectedRoutine?.id }),
      });
      setActiveWorkoutId(result.workout.id);
      setActiveRoutineName(result.workout.routineName);
      setActiveExercises(result.workout.exercises);
      setExerciseIndex(0);
      setSetNumber(1);
      setActualValue(result.workout.exercises[0].target);
      setScreen("exercise");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось начать тренировку");
    } finally {
      setBusy(false);
    }
  };

  const finishSet = async () => {
    if (!activeWorkoutId || !currentExercise) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/workouts/${activeWorkoutId}/sets`, {
        method: "POST",
        body: JSON.stringify({
          exerciseKey: currentExercise.key,
          progression: progressionFor(currentExercise),
          setNumber,
          targetValue: currentExercise.target,
          actualValue,
          unit: currentExercise.unit,
        }),
      });
      setLastSet({ exercise: currentExercise, setNumber, actualValue });
      setEffort(null);
      setRestSeconds(120);
      setScreen("rest");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить подход");
    } finally {
      setBusy(false);
    }
  };

  const rateEffort = async (value: Effort) => {
    if (!activeWorkoutId || !lastSet) return;
    setEffort(value);
    try {
      await api(`/api/workouts/${activeWorkoutId}/sets`, {
        method: "POST",
        body: JSON.stringify({
          exerciseKey: lastSet.exercise.key,
          progression: progressionFor(lastSet.exercise),
          setNumber: lastSet.setNumber,
          targetValue: lastSet.exercise.target,
          actualValue: lastSet.actualValue,
          unit: lastSet.exercise.unit,
          effort: value,
        }),
      });
    } catch {
      setEffort(null);
    }
  };

  const continueAfterRest = async () => {
    if (!currentExercise) return;
    if (setNumber < currentExercise.sets) {
      setSetNumber((value) => value + 1);
      setActualValue(currentExercise.target);
      setScreen("exercise");
      return;
    }
    if (exerciseIndex < activeExercises.length - 1) {
      const nextIndex = exerciseIndex + 1;
      setExerciseIndex(nextIndex);
      setSetNumber(1);
      setActualValue(activeExercises[nextIndex].target);
      setScreen("exercise");
      return;
    }
    if (!activeWorkoutId) return;
    setBusy(true);
    try {
      const result = await api<{ workout: { durationSeconds: number; setCount: number } }>(
        `/api/workouts/${activeWorkoutId}/complete`,
        { method: "POST" },
      );
      setSummary(result.workout);
      setActiveWorkoutId(null);
      const data = await api<{ history: HistoryItem[] }>("/api/workouts");
      setHistory(data.history);
      setScreen("summary");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить тренировку");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setAuthScreen("email");
    setScreen("home");
    setHistory([]);
    setRoutines([]);
    setProgressions({});
    setSelectedRoutineId(null);
    setActiveWorkoutId(null);
    setActiveExercises([]);
    setActiveRoutineName("");
  };

  if (loading) {
    return <main className="loading-screen"><span className="logo-mark">F</span><p>FORMA</p></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-lockup"><span className="logo-mark">F</span><strong>FORMA</strong></div>
          <div className="auth-copy">
            <span className="eyebrow">Тренируйся по форме</span>
            <h1>
              {authScreen === "email" && "Начнём с почты"}
              {authScreen === "login" && "С возвращением"}
              {authScreen === "register" && "Создай профиль"}
              {authScreen === "forgot" && "Восстановить доступ"}
            </h1>
            <p>
              {authScreen === "email" && "Свои наборы тренировок, прогрессии и история — в одном месте."}
              {authScreen === "login" && email}
              {authScreen === "register" && `Аккаунт для ${email}`}
              {authScreen === "forgot" && "Отправим инструкцию на указанную почту."}
            </p>
          </div>
          <form onSubmit={authSubmit} className="auth-form">
            {authScreen === "email" && (
              <>
                <label>Почта<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
                <button type="button" className="primary-button" onClick={() => email.trim() ? setAuthScreen("login") : setError("Введите почту")}>Войти</button>
                <button type="button" className="secondary-button" onClick={() => email.trim() ? setAuthScreen("register") : setError("Введите почту")}>Регистрация</button>
              </>
            )}
            {authScreen === "login" && (
              <>
                <label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" /></label>
                <button disabled={busy} className="primary-button">Войти</button>
                <button type="button" className="text-button" onClick={() => setAuthScreen("forgot")}>Забыл пароль</button>
                <button type="button" className="back-link" onClick={() => setAuthScreen("email")}>← Другая почта</button>
              </>
            )}
            {authScreen === "register" && (
              <>
                <label>Имя<input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" /></label>
                <div className="field-row">
                  <label>Пол<select value={gender} onChange={(e) => setGender(e.target.value)}><option value="unspecified">Не указывать</option><option value="male">Мужской</option><option value="female">Женский</option></select></label>
                  <label>Дата рождения<input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></label>
                </div>
                <label>Пароль<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" /></label>
                <button disabled={busy} className="primary-button">Создать аккаунт</button>
                <button type="button" className="back-link" onClick={() => setAuthScreen("email")}>← Назад</button>
              </>
            )}
            {authScreen === "forgot" && (
              <>
                <label>Почта<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <button disabled={busy} className="primary-button">Отправить инструкцию</button>
                <button type="button" className="back-link" onClick={() => setAuthScreen("login")}>← Ко входу</button>
              </>
            )}
            {error && <p className="form-message error-message">{error}</p>}
            {notice && <p className="form-message success-message">{notice}</p>}
          </form>
        </section>
        <aside className="auth-visual">
          <span className="visual-kicker">FORMA / 01</span>
          <p>Контроль прогрессии.<br />Чистая техника.<br />Каждый подход в счёт.</p>
          <div className="motion-ring"><span>↗</span></div>
        </aside>
      </main>
    );
  }

  const isHome = screen === "home";
  const headerTitle =
    screen === "routines" ? "Мои тренировки"
      : screen === "routine" ? selectedRoutine?.name ?? "Набор"
        : screen === "routineEdit" ? (draft?.id ? "Редактирование" : "Новый набор")
          : screen === "exercise" || screen === "rest" ? activeRoutineName
            : screen === "summary" ? "Готово"
              : screen === "history" ? "История"
                : screen === "profile" ? user.name
                  : "";

  const goBack = () => {
    if (screen === "routines" || screen === "history" || screen === "profile" || screen === "summary") {
      setScreen("home");
      return;
    }
    if (screen === "routine") {
      setScreen(routineReturnScreen);
      return;
    }
    if (screen === "routineEdit") {
      cancelEdit();
      return;
    }
    if (screen === "exercise" || screen === "rest") {
      if (selectedRoutine) setScreen("routine");
      else setScreen("home");
    }
  };

  return (
    <main className="app-background">
      <section className="phone-app">
        <header className={`topbar ${isHome ? "home-topbar" : ""}`}>
          {isHome ? (
            <h1>Тренировки</h1>
          ) : (
            <button className="icon-button" onClick={goBack} aria-label="Назад">←</button>
          )}
          {isHome ? (
            <div className="home-menu-wrap">
              <button
                className="icon-button more-button"
                onClick={() => setHomeMenuOpen((value) => !value)}
                aria-label="Открыть меню"
                aria-expanded={homeMenuOpen}
              >
                <span /><span /><span />
              </button>
              {homeMenuOpen && (
                <div className="home-menu">
                  <button onClick={() => { setScreen("history"); setHomeMenuOpen(false); }}>История</button>
                  <button onClick={() => { setScreen("profile"); setHomeMenuOpen(false); }}>Профиль</button>
                </div>
              )}
            </div>
          ) : (
            <strong className="topbar-title">{headerTitle}</strong>
          )}
        </header>

        <div className="screen-content" ref={screenContentRef}>
          {screen === "home" && (
            <div className="screen-stack home-dashboard">
              <div className="home-stat-grid">
                <article className="home-stat-card">
                  <strong>{stats.total}</strong>
                  <span>Всего тренировок</span>
                  <button onClick={() => setScreen("history")}>История <i>→</i></button>
                </article>
                <article className="home-stat-card streak-card">
                  <strong>{stats.streak}</strong>
                  <span>Тренировок<br />подряд</span>
                  <div className="record-label">Личный рекорд <i aria-hidden="true">♨</i></div>
                </article>
              </div>

              <section className="cycle-card">
                <span>Текущий цикл</span>
                <h2>Тренировка {currentCycleWorkout} из 12</h2>
                <div className="cycle-progress" aria-label={`Тренировка ${currentCycleWorkout} из 12`}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <i
                      key={index}
                      className={index + 1 < currentCycleWorkout ? "done" : index + 1 === currentCycleWorkout ? "current" : ""}
                    />
                  ))}
                </div>
                <p>Верх тела · силовая</p>
              </section>

              <section className="progress-card">
                <h2>Прогресс с прошлой тренировки</h2>
                <div className="progress-list">
                  <div>
                    <span className="exercise-icon">↟</span>
                    <p>Выходы силой: с резиной</p>
                    <span className="progress-values"><i>5 × 2 →</i> <strong>5 × 3</strong></span>
                  </div>
                  <div>
                    <span className="exercise-icon">↯</span>
                    <p>Стойка на руках: у стены</p>
                    <span className="progress-values"><i>22 сек →</i> <strong>30 сек</strong></span>
                  </div>
                  <div>
                    <span className="exercise-icon">⌜</span>
                    <p>Планш: tuck planche</p>
                    <span className="progress-values"><i>8 сек →</i> <strong>10 сек</strong></span>
                  </div>
                </div>
              </section>

              <section className="home-routines">
                <div className="routines-heading">
                  <h2>Мои тренировки</h2>
                  {routines.length > 0 && <button onClick={() => setScreen("routines")}>Все <span>→</span></button>}
                </div>
                {routines.length > 0 ? (
                  <div className="routine-card-list compact">
                    {routines.slice(0, 3).map((routine) => {
                      const icon = EXERCISES_BY_KEY[routine.exerciseKeys[0]]?.icon ?? "＋";
                      return (
                        <button
                          className="routine-card"
                          key={routine.id}
                          onClick={() => openRoutine(routine, "home")}
                        >
                          <span className="routine-icon">{icon}</span>
                          <span className="routine-copy">
                            <strong>{routine.name}</strong>
                            <small>{exerciseCountLabel(routine.exerciseKeys.length)} · {routine.durationMinutes} мин</small>
                            <i className={`difficulty ${routine.difficulty}`}>{difficultyLabel[routine.difficulty]}</i>
                          </span>
                          <span className="routine-arrow">›</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="routines-empty">Создай свою первую тренировку</div>
                )}
                <button className="new-routine-button" onClick={() => createRoutine("home")}>
                  <span>＋</span> Новый набор
                </button>
              </section>
            </div>
          )}

          {screen === "routines" && (
            <div className="screen-stack routines-screen">
              <div className="page-title">
                <span className="eyebrow">Конструктор</span>
                <h1>Мои тренировки</h1>
                <p>Собери тренировку под себя</p>
              </div>
              {routines.length > 0 ? (
                <div className="routine-card-list">
                  {routines.map((routine) => (
                    <button className="routine-card" key={routine.id} onClick={() => openRoutine(routine, "routines")}>
                      <span className="routine-icon">{EXERCISES_BY_KEY[routine.exerciseKeys[0]]?.icon ?? "＋"}</span>
                      <span className="routine-copy">
                        <strong>{routine.name}</strong>
                        <small>{exerciseCountLabel(routine.exerciseKeys.length)} · {routine.durationMinutes} мин</small>
                        <i className={`difficulty ${routine.difficulty}`}>{difficultyLabel[routine.difficulty]}</i>
                      </span>
                      <span className="routine-arrow">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <section className="empty-state">
                  <span>＋</span>
                  <h2>Создай свою первую тренировку</h2>
                  <p>Добавь любимые упражнения и расставь их в удобном порядке.</p>
                </section>
              )}
            </div>
          )}

          {screen === "routine" && selectedRoutine && (
            <div className="screen-stack routine-detail-screen">
              <div className="routine-detail-title">
                <span className="routine-icon large">
                  {EXERCISES_BY_KEY[selectedRoutine.exerciseKeys[0]]?.icon ?? "＋"}
                </span>
                <div>
                  <span className="eyebrow">Набор тренировки</span>
                  <h1>{selectedRoutine.name}</h1>
                  <i className={`difficulty ${selectedRoutine.difficulty}`}>
                    {difficultyLabel[selectedRoutine.difficulty]}
                  </i>
                </div>
              </div>
              <div className="routine-meta">
                <span><i>↟</i><strong>{exerciseCountLabel(selectedRoutine.exerciseKeys.length)}</strong></span>
                <span><i>◷</i><strong>{selectedRoutine.durationMinutes} мин</strong></span>
              </div>
              <div className="routine-exercise-list">
                {selectedRoutine.exerciseKeys.map((key, index) => {
                  const exercise = EXERCISES_BY_KEY[key];
                  if (!exercise) return null;
                  return (
                    <article key={key}>
                      <span className="exercise-order">{index + 1}</span>
                      <span className="exercise-icon">{exercise.icon}</span>
                      <p>
                        <strong>{exercise.name}</strong>
                        <small>{exercise.sets} × {exercise.target} {exercise.unit} · {routineProgressionFor(exercise, selectedRoutine.id)}</small>
                      </p>
                      <button className="change-progression" onClick={() => setPicker(exercise)}>
                        Изменить
                      </button>
                    </article>
                  );
                })}
              </div>
              {activeWorkoutId && (
                <p className="inline-notice">
                  Сейчас активна тренировка «{activeRoutineName}». Кнопка ниже продолжит её.
                </p>
              )}
              <div className="routine-secondary-actions">
                <button className="secondary-button" onClick={editRoutine}>Редактировать</button>
                <button className="text-danger-button" onClick={() => setDeleteConfirmOpen(true)}>Удалить набор</button>
              </div>
            </div>
          )}

          {screen === "routineEdit" && draft && (
            <div className="screen-stack routine-editor-screen">
              <div className="page-title">
                <span className="eyebrow">{draft.id ? "Измени детали и состав" : "Собери тренировку под себя"}</span>
                <h1>{draft.id ? "Редактирование" : "Новый набор"}</h1>
              </div>
              <div className="routine-fields">
                <label>
                  Название
                  <input
                    value={draft.name}
                    maxLength={80}
                    placeholder="Например, Push day"
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <div className="routine-field-row">
                  <label>
                    Время, мин
                    <input
                      type="number"
                      min={5}
                      max={240}
                      value={draft.durationMinutes}
                      onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}
                    />
                  </label>
                  <fieldset>
                    <legend>Сложность</legend>
                    <div className="difficulty-picker">
                      {(["easy", "medium", "hard"] as Difficulty[]).map((value) => (
                        <button
                          type="button"
                          key={value}
                          className={draft.difficulty === value ? "active" : ""}
                          aria-label={difficultyLabel[value]}
                          title={difficultyLabel[value]}
                          onClick={() => setDraft({ ...draft, difficulty: value })}
                        >
                          {value === "easy" ? "Л" : value === "medium" ? "С" : "В"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
              <div className="editor-heading">
                <h2>Упражнения</h2>
                <span>{draft.exerciseKeys.length}</span>
              </div>
              {draftExercises.length > 0 ? (
                <div className="editor-exercise-list">
                  {draftExercises.map((exercise, index) => (
                    <article key={exercise.key}>
                      <span className="drag-handle" aria-hidden="true">⠿</span>
                      <span className="exercise-icon">{exercise.icon}</span>
                      <p>
                        <strong>{exercise.name}</strong>
                        <small>{exercise.sets} × {exercise.target} {exercise.unit}</small>
                      </p>
                      <div className="reorder-actions">
                        <button
                          onClick={() => moveDraftExercise(index, -1)}
                          disabled={index === 0}
                          aria-label={`Поднять ${exercise.name}`}
                        >↑</button>
                        <button
                          onClick={() => moveDraftExercise(index, 1)}
                          disabled={index === draftExercises.length - 1}
                          aria-label={`Опустить ${exercise.name}`}
                        >↓</button>
                      </div>
                      <button
                        className="remove-exercise"
                        onClick={() => setDraft({
                          ...draft,
                          exerciseKeys: draft.exerciseKeys.filter((key) => key !== exercise.key),
                        })}
                        aria-label={`Удалить ${exercise.name}`}
                      >×</button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="editor-empty">Добавь хотя бы одно упражнение</div>
              )}
              <button className="add-exercise-button" onClick={openCatalog}>
                <span>＋</span> Добавить упражнение
              </button>
              <button className="cancel-edit-button" onClick={cancelEdit}>Отмена</button>
            </div>
          )}

          {screen === "exercise" && currentExercise && (
            <div className="screen-stack exercise-screen">
              <div className="page-title centered">
                <span className="eyebrow">Прогрессия</span>
                <h1>{currentExercise.name}:<br /><em>{progressionFor(currentExercise)}</em></h1>
              </div>
              <section className="set-card">
                <p>Подход {setNumber} из {currentExercise.sets}</p>
                <strong>{actualValue}</strong>
                <span>{currentExercise.unit}</span>
                <div className="set-dots">
                  {Array.from({ length: currentExercise.sets }, (_, index) => (
                    <i key={index} className={index + 1 < setNumber ? "done" : index + 1 === setNumber ? "current" : ""}>{index + 1}</i>
                  ))}
                </div>
                <div className="counter">
                  <button onClick={() => setActualValue((value) => Math.max(0, value - 1))}>−</button>
                  <span>факт: {actualValue}</span>
                  <button onClick={() => setActualValue((value) => value + 1)}>+</button>
                </div>
              </section>
              <section className="next-card">
                <span className="eyebrow">Дальше</span>
                <strong>{setNumber < currentExercise.sets ? `${currentExercise.name}, подход ${setNumber + 1}` : activeExercises[exerciseIndex + 1]?.name || "Завершение тренировки"}</strong>
              </section>
            </div>
          )}

          {screen === "rest" && lastSet && (
            <div className="screen-stack rest-screen">
              <div className="page-title centered"><span className="eyebrow">После подхода {lastSet.setNumber} из {lastSet.exercise.sets}</span><h1>Отдых</h1></div>
              <div className="timer-ring" style={{ "--progress": `${(restSeconds / 120) * 360}deg` } as React.CSSProperties}>
                <div><strong>{String(Math.floor(restSeconds / 60)).padStart(2, "0")}:{String(restSeconds % 60).padStart(2, "0")}</strong><span>до следующего подхода</span></div>
              </div>
              <section className="effort-card">
                <span className="eyebrow">Как прошёл подход?</span>
                <div className="effort-grid">
                  {([["easy", "Легко"], ["reserve", "С запасом"], ["hard", "Тяжело"]] as [Effort, string][]).map(([value, label]) => (
                    <button key={value} className={effort === value ? "active" : ""} onClick={() => rateEffort(value)}>{label}</button>
                  ))}
                </div>
              </section>
              <div className="rest-actions"><button onClick={() => setRestSeconds((value) => value + 30)}>+30 сек</button><button onClick={continueAfterRest}>Пропустить</button></div>
              <section className="next-card"><span className="eyebrow">Следующий подход</span><strong>{setNumber < lastSet.exercise.sets ? `${lastSet.exercise.name}: ${lastSet.exercise.target} ${lastSet.exercise.unit}` : activeExercises[exerciseIndex + 1]?.name || "Финиш"}</strong></section>
            </div>
          )}

          {screen === "summary" && summary && (
            <div className="screen-stack summary-screen">
              <div className="success-orbit">✓</div>
              <div className="page-title centered"><span className="eyebrow">Тренировка завершена</span><h1>Отличная<br />работа</h1><p>{activeRoutineName} · {durationLabel(summary.durationSeconds)}</p></div>
              <div className="stat-grid"><article><strong>{summary.setCount}</strong><span>подходов</span></article><article><strong>{history.length}</strong><span>всего тренировок</span></article></div>
              <button className="primary-button" onClick={() => setScreen("home")}>На главную</button>
            </div>
          )}

          {screen === "history" && (
            <div className="screen-stack">
              <div className="page-title"><span className="eyebrow">Статистика</span><h1>История</h1><p>Здесь сохраняются завершённые тренировки.</p></div>
              {history.length === 0 ? (
                <section className="empty-state"><span>↗</span><h2>Первая тренировка впереди</h2><p>Выбери свой набор на главной и начни тренировку.</p><button className="primary-button" onClick={() => setScreen("home")}>К наборам</button></section>
              ) : (
                <div className="history-list">
                  {history.map((item) => <article key={item.id}><span className="workout-badge">✓</span><p><strong>{item.routineName}</strong><small>{dateLabel(item.completedAt)} · {durationLabel(item.durationSeconds)} · {item.setCount} подходов</small></p><span>✓</span></article>)}
                </div>
              )}
            </div>
          )}

          {screen === "profile" && (
            <div className="screen-stack">
              <div className="page-title"><span className="eyebrow">Аккаунт</span><h1>{user.name}</h1><p>{user.email}</p></div>
              <section className="profile-card">
                <div><span>Дата рождения</span><strong>{new Date(`${user.birthDate}T00:00:00`).toLocaleDateString("ru-RU")}</strong></div>
                <div><span>Пол</span><strong>{user.gender === "male" ? "Мужской" : user.gender === "female" ? "Женский" : "Не указан"}</strong></div>
                <div><span>Тренировок</span><strong>{history.length}</strong></div>
              </section>
              <button className="secondary-button danger-button" onClick={logout}>Выйти из аккаунта</button>
            </div>
          )}
          {error && user && <button className="toast" onClick={() => setError("")}>{error} ×</button>}
        </div>

        {screen === "routines" && (
          <div className="screen-action">
            <button className="primary-button" onClick={() => createRoutine("routines")}>＋ Новый набор</button>
          </div>
        )}
        {screen === "routine" && selectedRoutine && (
          <div className="screen-action">
            <button disabled={busy} className="primary-button" onClick={startWorkout}>
              {activeWorkoutId ? "Продолжить тренировку" : "Начать тренировку"}
            </button>
          </div>
        )}
        {screen === "routineEdit" && draft && (
          <div className="screen-action">
            <button disabled={busy} className="primary-button" onClick={saveRoutine}>Сохранить</button>
          </div>
        )}
        {screen === "exercise" && (
          <div className="screen-action">
            <button disabled={busy} className="primary-button" onClick={finishSet}>Завершить подход</button>
          </div>
        )}
        {screen === "rest" && (
          <div className="screen-action">
            <button disabled={busy} className="primary-button" onClick={continueAfterRest}>Начать раньше</button>
          </div>
        )}

      </section>

      {catalogOpen && draft && (
        <div className="modal-backdrop" onClick={() => setCatalogOpen(false)}>
          <section className="catalog-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <h2>Добавить упражнение</h2>
            <label className="catalog-search">
              <span>⌕</span>
              <input
                autoFocus
                value={catalogSearch}
                placeholder="Поиск упражнений"
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </label>
            <div className="catalog-filters">
              {([
                ["all", "Все"],
                ["push", "Жим"],
                ["pull", "Тяга"],
                ["core", "Кор"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={catalogCategory === value ? "active" : ""}
                  onClick={() => setCatalogCategory(value)}
                >{label}</button>
              ))}
            </div>
            <div className="catalog-list">
              {filteredCatalog.map((exercise) => {
                const existing = draft.exerciseKeys.includes(exercise.key);
                const selected = catalogSelection.includes(exercise.key);
                return (
                  <button
                    key={exercise.key}
                    disabled={existing}
                    className={selected || existing ? "selected" : ""}
                    onClick={() => setCatalogSelection((items) =>
                      items.includes(exercise.key)
                        ? items.filter((key) => key !== exercise.key)
                        : [...items, exercise.key]
                    )}
                  >
                    <span className="exercise-icon">{exercise.icon}</span>
                    <span>
                      <strong>{exercise.name}</strong>
                      <small>{exercise.muscles}</small>
                    </span>
                    <i>{existing ? "✓" : selected ? "✓" : ""}</i>
                  </button>
                );
              })}
              {filteredCatalog.length === 0 && <p className="catalog-empty">Ничего не найдено</p>}
            </div>
            <button
              className="primary-button"
              disabled={catalogSelection.length === 0}
              onClick={addCatalogExercises}
            >
              {catalogSelection.length > 0 ? `Добавить ${catalogSelection.length}` : "Выбери упражнения"}
            </button>
          </section>
        </div>
      )}

      {picker && selectedRoutine && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <section className="progression-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <span className="eyebrow">Выбери прогрессию</span>
            <h2>{picker.name}</h2>
            <div className="progression-options">
              {picker.progressions.map((progression) => (
                <button
                  key={progression}
                  className={routineProgressionFor(picker, selectedRoutine.id) === progression ? "active" : ""}
                  onClick={() => chooseProgression(picker, progression)}
                >
                  <span>{progression}</span>
                  <i>{routineProgressionFor(picker, selectedRoutine.id) === progression ? "✓" : "→"}</i>
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => setPicker(null)}>Отмена</button>
          </section>
        </div>
      )}

      {deleteConfirmOpen && selectedRoutine && (
        <div className="modal-backdrop centered-modal" onClick={() => setDeleteConfirmOpen(false)}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <span className="confirm-icon">×</span>
            <h2>Удалить «{selectedRoutine.name}»?</h2>
            <p>Набор исчезнет с главной и из общего списка. Завершённые тренировки останутся в истории.</p>
            <button className="danger-confirm-button" disabled={busy} onClick={deleteRoutine}>Удалить набор</button>
            <button className="secondary-button" onClick={() => setDeleteConfirmOpen(false)}>Отмена</button>
          </section>
        </div>
      )}
    </main>
  );
}
