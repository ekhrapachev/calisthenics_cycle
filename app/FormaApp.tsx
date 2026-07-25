"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  name: string;
  gender: string;
  birthDate: string;
};

type WorkoutType = "push" | "pull";
type Effort = "easy" | "reserve" | "hard";
type Screen = "home" | "plan" | "exercise" | "rest" | "summary" | "history" | "profile";
type AuthScreen = "email" | "login" | "register" | "forgot";

type Exercise = {
  key: string;
  name: string;
  icon: string;
  sets: number;
  target: number;
  unit: "повтора" | "сек";
  progressions: string[];
  defaultProgression: string;
};

type HistoryItem = {
  id: string;
  workoutType: WorkoutType;
  completedAt: number;
  durationSeconds: number;
  setCount: number;
};

const WORKOUTS: Record<WorkoutType, Exercise[]> = {
  pull: [
    {
      key: "muscle-up",
      name: "Выход силой",
      icon: "↟",
      sets: 5,
      target: 2,
      unit: "повтора",
      progressions: ["С резиной", "Негативные", "Чистый выход"],
      defaultProgression: "С резиной",
    },
    {
      key: "high-pull",
      name: "Высокие подтягивания",
      icon: "↑",
      sets: 4,
      target: 5,
      unit: "повтора",
      progressions: ["До груди", "До солнечного сплетения", "До пояса"],
      defaultProgression: "До груди",
    },
    {
      key: "front-lever",
      name: "Передний вис",
      icon: "⌐",
      sets: 3,
      target: 10,
      unit: "сек",
      progressions: ["Группировка", "Одна нога", "Полный вис"],
      defaultProgression: "Группировка",
    },
  ],
  push: [
    {
      key: "handstand-push-up",
      name: "Отжимания в стойке",
      icon: "↥",
      sets: 4,
      target: 5,
      unit: "повтора",
      progressions: ["У стены", "На паралетсах", "Свободные"],
      defaultProgression: "У стены",
    },
    {
      key: "dips",
      name: "Брусья",
      icon: "∏",
      sets: 4,
      target: 8,
      unit: "повтора",
      progressions: ["С резиной", "С весом тела", "С дополнительным весом"],
      defaultProgression: "С весом тела",
    },
    {
      key: "planche",
      name: "Планш",
      icon: "↯",
      sets: 3,
      target: 10,
      unit: "сек",
      progressions: ["Лин", "Группировка", "Стреддл"],
      defaultProgression: "Лин",
    },
  ],
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

const workoutLabel = (type: WorkoutType) => type.toUpperCase();
const durationLabel = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} мин`;
const dateLabel = (value: number) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));

export default function FormaApp() {
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
  const [workoutType, setWorkoutType] = useState<WorkoutType>("push");
  const [progressions, setProgressions] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<Exercise | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [actualValue, setActualValue] = useState(1);
  const [restSeconds, setRestSeconds] = useState(120);
  const [lastSet, setLastSet] = useState<{ exercise: Exercise; setNumber: number; actualValue: number } | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [summary, setSummary] = useState<{ durationSeconds: number; setCount: number } | null>(null);

  const exercises = WORKOUTS[workoutType];
  const currentExercise = exercises[exerciseIndex];
  const progressionFor = (exercise: Exercise, type = workoutType) =>
    progressions[`${type}:${exercise.key}`] || exercise.defaultProgression;

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api<{ progressions: { workoutType: WorkoutType; exerciseKey: string; progression: string }[] }>("/api/progressions"),
      api<{ active: { id: string; workoutType: WorkoutType } | null; history: HistoryItem[] }>("/api/workouts"),
    ])
      .then(([progressionData, workoutData]) => {
        const next: Record<string, string> = {};
        progressionData.progressions.forEach((item) => {
          next[`${item.workoutType}:${item.exerciseKey}`] = item.progression;
        });
        setProgressions(next);
        setHistory(workoutData.history);
        if (workoutData.active) {
          setActiveWorkoutId(workoutData.active.id);
          setWorkoutType(workoutData.active.workoutType);
        }
      })
      .catch((reason: Error) => setError(reason.message));
  }, [user]);

  useEffect(() => {
    if (screen !== "rest" || restSeconds <= 0) return;
    const timer = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [screen, restSeconds]);

  const stats = useMemo(() => {
    const total = history.length;
    const streak = history.length ? Math.min(history.length, 6) : 0;
    return { total, streak };
  }, [history]);

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

  const chooseProgression = async (exercise: Exercise, progression: string) => {
    const key = `${workoutType}:${exercise.key}`;
    const previous = progressions[key];
    setProgressions((value) => ({ ...value, [key]: progression }));
    setPicker(null);
    try {
      await api("/api/progressions", {
        method: "PUT",
        body: JSON.stringify({ workoutType, exerciseKey: exercise.key, progression }),
      });
    } catch (reason) {
      setProgressions((value) => ({ ...value, [key]: previous || exercise.defaultProgression }));
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить прогрессию");
    }
  };

  const startWorkout = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ workout: { id: string; workoutType: WorkoutType } }>("/api/workouts", {
        method: "POST",
        body: JSON.stringify({ workoutType }),
      });
      const actualWorkoutType = result.workout.workoutType || workoutType;
      setActiveWorkoutId(result.workout.id);
      setWorkoutType(actualWorkoutType);
      setExerciseIndex(0);
      setSetNumber(1);
      setActualValue(WORKOUTS[actualWorkoutType][0].target);
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
    if (exerciseIndex < exercises.length - 1) {
      const nextIndex = exerciseIndex + 1;
      setExerciseIndex(nextIndex);
      setSetNumber(1);
      setActualValue(exercises[nextIndex].target);
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
    setProgressions({});
    setActiveWorkoutId(null);
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
              {authScreen === "email" && "Планы PUSH и PULL, прогрессии и история — в одном месте."}
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

  const showNavigation = ["home", "history", "profile"].includes(screen);

  return (
    <main className="app-background">
      <section className="phone-app">
        <header className="topbar">
          {showNavigation ? (
            <div className="brand-lockup compact"><span className="logo-mark">F</span><strong>FORMA</strong></div>
          ) : (
            <button className="icon-button" onClick={() => setScreen(screen === "plan" ? "home" : "plan")} aria-label="Назад">←</button>
          )}
          <span className="topbar-note">{showNavigation ? `Привет, ${user.name}` : workoutLabel(workoutType)}</span>
        </header>

        <div className="screen-content">
          {screen === "home" && (
            <div className="screen-stack">
              <section className="hero-panel">
                <span className="eyebrow">Текущий цикл</span>
                <h1>Тренировка<br />{stats.total + 1}</h1>
                <p>Выбери направление на сегодня. Прогрессии можно изменить в плане до старта.</p>
                <div className="hero-progress"><span style={{ width: `${Math.min(100, ((stats.total % 12) + 1) / 12 * 100)}%` }} /></div>
              </section>

              <div className="stat-grid">
                <article><strong>{stats.total}</strong><span>тренировок</span></article>
                <article><strong>{stats.streak}</strong><span>подряд</span></article>
              </div>

              <section className="section-card">
                <div className="section-heading"><div><span className="eyebrow">Следующая тренировка</span><h2>{workoutLabel(workoutType)}</h2></div><span className="duration-pill">≈ 55 мин</span></div>
                <div className="switcher">
                  <button className={workoutType === "push" ? "active" : ""} onClick={() => setWorkoutType("push")}>PUSH</button>
                  <button className={workoutType === "pull" ? "active" : ""} onClick={() => setWorkoutType("pull")}>PULL</button>
                </div>
                <div className="preview-list">
                  {exercises.slice(0, 3).map((exercise) => (
                    <div key={exercise.key}><span className="exercise-icon">{exercise.icon}</span><p><strong>{exercise.name}: {progressionFor(exercise)}</strong><small>{exercise.sets} × {exercise.target} {exercise.unit}</small></p></div>
                  ))}
                </div>
                <button className="primary-button" onClick={() => setScreen("plan")}>Открыть план</button>
              </section>
            </div>
          )}

          {screen === "plan" && (
            <div className="screen-stack">
              <div className="page-title"><span className="eyebrow">Сегодня · {workoutLabel(workoutType)}</span><h1>План тренировки</h1><p>≈ 55 мин · средняя нагрузка</p></div>
              <div className="timeline">
                <div className="timeline-item muted"><span className="exercise-icon">∿</span><p><strong>Разминка</strong><small>7 мин · суставная</small></p></div>
                {exercises.map((exercise) => (
                  <button className="timeline-item" key={exercise.key} onClick={() => setPicker(exercise)}>
                    <span className="exercise-icon">{exercise.icon}</span>
                    <p><strong>{exercise.name}: {progressionFor(exercise)}</strong><small>{exercise.sets} подхода × {exercise.target} {exercise.unit}</small></p>
                    <span className="change-link">Изменить ›</span>
                  </button>
                ))}
                <div className="timeline-item muted"><span className="exercise-icon">≈</span><p><strong>Заминка</strong><small>5 мин · восстановление</small></p></div>
              </div>
              {activeWorkoutId && <p className="inline-notice">Есть незавершённая тренировка — продолжим её.</p>}
              <button disabled={busy} className="primary-button sticky-action" onClick={startWorkout}>{activeWorkoutId ? "Продолжить тренировку" : "Начать тренировку"}</button>
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
                <button disabled={busy} className="primary-button" onClick={finishSet}>Завершить подход</button>
                <div className="counter">
                  <button onClick={() => setActualValue((value) => Math.max(0, value - 1))}>−</button>
                  <span>факт: {actualValue}</span>
                  <button onClick={() => setActualValue((value) => value + 1)}>+</button>
                </div>
              </section>
              <section className="next-card">
                <span className="eyebrow">Дальше</span>
                <strong>{setNumber < currentExercise.sets ? `${currentExercise.name}, подход ${setNumber + 1}` : exercises[exerciseIndex + 1]?.name || "Завершение тренировки"}</strong>
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
              <button disabled={busy} className="primary-button" onClick={continueAfterRest}>Начать раньше</button>
              <div className="rest-actions"><button onClick={() => setRestSeconds((value) => value + 30)}>+30 сек</button><button onClick={continueAfterRest}>Пропустить</button></div>
              <section className="next-card"><span className="eyebrow">Следующий подход</span><strong>{setNumber < lastSet.exercise.sets ? `${lastSet.exercise.name}: ${lastSet.exercise.target} ${lastSet.exercise.unit}` : exercises[exerciseIndex + 1]?.name || "Финиш"}</strong></section>
            </div>
          )}

          {screen === "summary" && summary && (
            <div className="screen-stack summary-screen">
              <div className="success-orbit">✓</div>
              <div className="page-title centered"><span className="eyebrow">Тренировка завершена</span><h1>Отличная<br />работа</h1><p>{workoutLabel(workoutType)} · {durationLabel(summary.durationSeconds)}</p></div>
              <div className="stat-grid"><article><strong>{summary.setCount}</strong><span>подходов</span></article><article><strong>{history.length}</strong><span>всего тренировок</span></article></div>
              <button className="primary-button" onClick={() => setScreen("home")}>На главную</button>
            </div>
          )}

          {screen === "history" && (
            <div className="screen-stack">
              <div className="page-title"><span className="eyebrow">Статистика</span><h1>История</h1><p>Здесь сохраняются завершённые тренировки.</p></div>
              {history.length === 0 ? (
                <section className="empty-state"><span>↗</span><h2>Первая тренировка впереди</h2><p>Выбери PUSH или PULL на главной и начни цикл.</p><button className="primary-button" onClick={() => setScreen("home")}>К плану</button></section>
              ) : (
                <div className="history-list">
                  {history.map((item) => <article key={item.id}><span className="workout-badge">{workoutLabel(item.workoutType)}</span><p><strong>{dateLabel(item.completedAt)}</strong><small>{durationLabel(item.durationSeconds)} · {item.setCount} подходов</small></p><span>✓</span></article>)}
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

        {showNavigation && (
          <nav className="bottom-nav">
            <button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")}><span>⌂</span>План</button>
            <button className={screen === "history" ? "active" : ""} onClick={() => setScreen("history")}><span>↗</span>История</button>
            <button className={screen === "profile" ? "active" : ""} onClick={() => setScreen("profile")}><span>○</span>Профиль</button>
          </nav>
        )}
      </section>

      {picker && (
        <div className="modal-backdrop" onClick={() => setPicker(null)}>
          <section className="progression-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <span className="eyebrow">Выбери прогрессию</span>
            <h2>{picker.name}</h2>
            <div className="progression-options">
              {picker.progressions.map((progression) => (
                <button key={progression} className={progressionFor(picker) === progression ? "active" : ""} onClick={() => chooseProgression(picker, progression)}>
                  <span>{progression}</span><i>{progressionFor(picker) === progression ? "✓" : "→"}</i>
                </button>
              ))}
            </div>
            <button className="secondary-button" onClick={() => setPicker(null)}>Отмена</button>
          </section>
        </div>
      )}
    </main>
  );
}
