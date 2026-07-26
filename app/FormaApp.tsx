"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EXERCISE_CATALOG,
  EXERCISES_BY_KEY,
  type Exercise,
  type ExerciseCategory,
} from "@/lib/workout-catalog";
import { getWorkoutExerciseStates } from "@/lib/workouts";

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

type ResumePosition = {
  exerciseIndex: number;
  setNumber: number;
};

type ActiveWorkout = {
  id: string;
  routineName: string;
  exercises: Exercise[];
  resume: ResumePosition | null;
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      typeof body.error === "string" ? body.error : "Что-то пошло не так",
      response.status,
    );
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

const focusableElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  );

const trapDialogFocus = (event: KeyboardEvent, container: HTMLElement | null) => {
  if (event.key !== "Tab" || !container) return;
  const focusable = focusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

export default function FormaApp() {
  const screenContentRef = useRef<HTMLDivElement>(null);
  const workoutPickerRef = useRef<HTMLElement>(null);
  const workoutPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const activeWorkoutCardRef = useRef<HTMLButtonElement>(null);
  const activeWorkoutDetailsRef = useRef<HTMLElement>(null);
  const activeWorkoutDetailsTitleRef = useRef<HTMLHeadingElement>(null);
  const discardDialogRef = useRef<HTMLElement>(null);
  const discardSafeActionRef = useRef<HTMLButtonElement>(null);
  const overlayDragStartRef = useRef<number | null>(null);
  const overlayHistoryDepthRef = useRef(0);
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
  const [homeStatus, setHomeStatus] = useState<"loading" | "ready" | "error">("loading");
  const [homeError, setHomeError] = useState("");
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
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false);
  const [startingRoutineId, setStartingRoutineId] = useState<string | null>(null);
  const [resumingWorkout, setResumingWorkout] = useState(false);
  const [workoutPickerError, setWorkoutPickerError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [activeRoutineName, setActiveRoutineName] = useState("");
  const [activeExercises, setActiveExercises] = useState<Exercise[]>([]);
  const [activeResume, setActiveResume] = useState<ResumePosition | null>(null);
  const [activeWorkoutDetailsOpen, setActiveWorkoutDetailsOpen] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [discardingWorkout, setDiscardingWorkout] = useState(false);
  const [discardWorkoutError, setDiscardWorkoutError] = useState("");
  const [discardWorkoutId, setDiscardWorkoutId] = useState<string | null>(null);
  const [discardReturnToDetails, setDiscardReturnToDetails] = useState(false);
  const [workoutEntry, setWorkoutEntry] = useState<"home" | "routine">("home");
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  const [actualValue, setActualValue] = useState(1);
  const [restSeconds, setRestSeconds] = useState(120);
  const [lastSet, setLastSet] = useState<{ exercise: Exercise; setNumber: number; actualValue: number } | null>(null);
  const [effort, setEffort] = useState<Effort | null>(null);
  const [summary, setSummary] = useState<{ durationSeconds: number; setCount: number } | null>(null);

  const selectedRoutine = routines.find((routine) => routine.id === selectedRoutineId) ?? null;
  const currentExercise = activeExercises[exerciseIndex];
  const routineProgressionFor = (exercise: Exercise, routineId = selectedRoutineId) =>
    routineId ? progressions[`${routineId}:${exercise.key}`] || exercise.defaultProgression : exercise.defaultProgression;
  const draftExercises = draft
    ? draft.exerciseKeys.map((key) => EXERCISES_BY_KEY[key]).filter((exercise): exercise is Exercise => Boolean(exercise))
    : [];
  const filteredCatalog = EXERCISE_CATALOG.filter((exercise) => {
    const matchesCategory = catalogCategory === "all" || exercise.category === catalogCategory;
    const query = catalogSearch.trim().toLocaleLowerCase("ru-RU");
    return matchesCategory && (!query || `${exercise.name} ${exercise.muscles}`.toLocaleLowerCase("ru-RU").includes(query));
  });
  const activeExerciseStates = getWorkoutExerciseStates(activeExercises.length, activeResume);
  const completedExerciseCount = activeExerciseStates.filter((state) => state === "completed").length;
  const resumeExercise = activeResume ? activeExercises[activeResume.exerciseIndex] : null;

  const openActiveWorkoutDetails = () => {
    if (!activeWorkoutId || activeWorkoutDetailsOpen || discardDialogOpen) return;
    window.history.pushState({ formaOverlay: "active-workout-details" }, "");
    overlayHistoryDepthRef.current = 1;
    setActiveWorkoutDetailsOpen(true);
  };

  const closeActiveWorkoutDetails = useCallback(() => {
    if (window.history.state?.formaOverlay === "active-workout-details") {
      window.history.back();
      return;
    }
    overlayHistoryDepthRef.current = 0;
    setActiveWorkoutDetailsOpen(false);
    window.requestAnimationFrame(() => activeWorkoutCardRef.current?.focus());
  }, []);

  const openDiscardDialog = (returnToDetails: boolean) => {
    if (!activeWorkoutId || discardingWorkout || discardDialogOpen) return;
    setDiscardWorkoutId(activeWorkoutId);
    setDiscardWorkoutError("");
    setDiscardReturnToDetails(returnToDetails);
    setActiveWorkoutDetailsOpen(false);
    window.history.pushState({ formaOverlay: "discard-active-workout" }, "");
    overlayHistoryDepthRef.current = returnToDetails ? 2 : 1;
    setDiscardDialogOpen(true);
  };

  const closeDiscardDialog = useCallback(() => {
    if (discardingWorkout) return;
    if (window.history.state?.formaOverlay === "discard-active-workout") {
      window.history.back();
      return;
    }
    setDiscardDialogOpen(false);
    setDiscardWorkoutError("");
    if (discardReturnToDetails && activeWorkoutId) {
      setActiveWorkoutDetailsOpen(true);
    } else {
      overlayHistoryDepthRef.current = 0;
      window.requestAnimationFrame(() => activeWorkoutCardRef.current?.focus());
    }
  }, [activeWorkoutId, discardReturnToDetails, discardingWorkout]);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const loadHomeData = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) {
      setHomeStatus("loading");
      setHomeError("");
    }
    try {
      const [routineData, progressionData, workoutData] = await Promise.all([
      api<{ routines: Routine[] }>("/api/routines"),
      api<{ progressions: { routineId: string; exerciseKey: string; progression: string }[] }>("/api/progressions"),
      api<{
        active: ActiveWorkout | null;
        history: HistoryItem[];
      }>("/api/workouts"),
      ]);
      const nextProgressions: Record<string, string> = {};
      progressionData.progressions.forEach((item) => {
        nextProgressions[`${item.routineId}:${item.exerciseKey}`] = item.progression;
      });
      setRoutines(routineData.routines);
      setProgressions(nextProgressions);
      setHistory(workoutData.history);
      setActiveWorkoutId(workoutData.active?.id ?? null);
      setActiveRoutineName(workoutData.active?.routineName ?? "");
      setActiveExercises(workoutData.active?.exercises ?? []);
      setActiveResume(workoutData.active?.resume ?? null);
      if (!workoutData.active) {
        const historyDepth = overlayHistoryDepthRef.current;
        overlayHistoryDepthRef.current = 0;
        setActiveWorkoutDetailsOpen(false);
        setDiscardDialogOpen(false);
        setDiscardWorkoutId(null);
        setDiscardWorkoutError("");
        setDiscardingWorkout(false);
        if (historyDepth > 0) {
          window.setTimeout(() => window.history.go(-historyDepth), 0);
          window.requestAnimationFrame(() => workoutPickerTriggerRef.current?.focus());
        }
      }
      setHomeStatus("ready");
    } catch (reason) {
      if (!showLoading) return;
      const message = reason instanceof Error ? reason.message : "Не удалось загрузить главную";
      setHomeError(message);
      setHomeStatus("error");
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadHomeData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadHomeData]);

  useEffect(() => {
    if (!user || screen !== "home") return;
    const syncHome = () => {
      if (document.visibilityState === "visible") void loadHomeData(false);
    };
    window.addEventListener("focus", syncHome);
    document.addEventListener("visibilitychange", syncHome);
    return () => {
      window.removeEventListener("focus", syncHome);
      document.removeEventListener("visibilitychange", syncHome);
    };
  }, [loadHomeData, screen, user]);

  useEffect(() => {
    if (!workoutPickerOpen) return;
    workoutPickerRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setWorkoutPickerOpen(false);
        window.requestAnimationFrame(() => workoutPickerTriggerRef.current?.focus());
        return;
      }
      trapDialogFocus(event, workoutPickerRef.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [workoutPickerOpen]);

  useEffect(() => {
    if (!activeWorkoutDetailsOpen) return;
    activeWorkoutDetailsTitleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActiveWorkoutDetails();
        return;
      }
      trapDialogFocus(event, activeWorkoutDetailsRef.current);
    };
    const handleBack = () => {
      overlayHistoryDepthRef.current = 0;
      setActiveWorkoutDetailsOpen(false);
      window.requestAnimationFrame(() => activeWorkoutCardRef.current?.focus());
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handleBack);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handleBack);
    };
  }, [activeWorkoutDetailsOpen, closeActiveWorkoutDetails]);

  useEffect(() => {
    if (!discardDialogOpen) return;
    discardSafeActionRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !discardingWorkout) {
        event.preventDefault();
        closeDiscardDialog();
        return;
      }
      trapDialogFocus(event, discardDialogRef.current);
    };
    const handleBack = () => {
      if (discardingWorkout) {
        window.history.forward();
        return;
      }
      setDiscardDialogOpen(false);
      setDiscardWorkoutError("");
      if (discardReturnToDetails && activeWorkoutId) {
        overlayHistoryDepthRef.current = 1;
        setActiveWorkoutDetailsOpen(true);
      } else {
        overlayHistoryDepthRef.current = 0;
        window.requestAnimationFrame(() => activeWorkoutCardRef.current?.focus());
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("popstate", handleBack);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("popstate", handleBack);
    };
  }, [
    activeWorkoutId,
    closeDiscardDialog,
    discardDialogOpen,
    discardReturnToDetails,
    discardingWorkout,
  ]);

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
    const routineId = selectedRoutine.id;
    const key = `${routineId}:${exercise.key}`;
    const previous = progressions[key];
    setProgressions((items) => ({ ...items, [key]: progression }));
    setPicker(null);
    try {
      await api("/api/progressions", {
        method: "PUT",
        body: JSON.stringify({ routineId, exerciseKey: exercise.key, progression }),
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

  const closeWorkoutPicker = () => {
    setWorkoutPickerOpen(false);
    setWorkoutPickerError("");
    window.requestAnimationFrame(() => workoutPickerTriggerRef.current?.focus());
  };

  const openWorkout = (workout: ActiveWorkout, entry: "home" | "routine") => {
    setActiveWorkoutId(workout.id);
    setActiveRoutineName(workout.routineName || "Активная тренировка");
    setActiveExercises(workout.exercises);
    setActiveResume(workout.resume);
    setWorkoutEntry(entry);

    if (workout.resume) {
      const exercise = workout.exercises[workout.resume.exerciseIndex];
      setExerciseIndex(workout.resume.exerciseIndex);
      setSetNumber(workout.resume.setNumber);
      setActualValue(exercise?.target ?? 1);
      setScreen("exercise");
    }
  };

  const completeActiveWorkout = async (workoutId = activeWorkoutId) => {
    if (!workoutId) return;
    const result = await api<{ workout: { durationSeconds: number; setCount: number } }>(
      `/api/workouts/${workoutId}/complete`,
      { method: "POST" },
    );
    setSummary(result.workout);
    setActiveWorkoutId(null);
    setActiveExercises([]);
    setActiveResume(null);
    const data = await api<{ history: HistoryItem[] }>("/api/workouts");
    setHistory(data.history);
    setScreen("summary");
  };

  const startWorkout = async (routineId: string, entry: "home" | "routine") => {
    if (startingRoutineId || resumingWorkout) return;
    setStartingRoutineId(routineId);
    setWorkoutPickerError("");
    setError("");
    try {
      const result = await api<{
        workout: ActiveWorkout;
      }>("/api/workouts", {
        method: "POST",
        body: JSON.stringify({ routineId }),
      });
      setWorkoutPickerOpen(false);
      openWorkout(result.workout, entry);
      if (!result.workout.resume) await completeActiveWorkout(result.workout.id);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось начать тренировку";
      if (entry === "home") {
        setWorkoutPickerOpen(true);
        setWorkoutPickerError(message);
        if (reason instanceof ApiError && reason.status === 404) {
          setRoutines((items) => items.filter((item) => item.id !== routineId));
        }
      } else {
        setError(message);
      }
    } finally {
      setStartingRoutineId(null);
    }
  };

  const resumeWorkout = async () => {
    if (!activeWorkoutId || resumingWorkout || startingRoutineId) return;
    setResumingWorkout(true);
    setError("");
    try {
      if (!activeResume) {
        await completeActiveWorkout();
        return;
      }
      openWorkout({
        id: activeWorkoutId,
        routineName: activeRoutineName,
        exercises: activeExercises,
        resume: activeResume,
      }, "home");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось продолжить тренировку");
    } finally {
      setResumingWorkout(false);
    }
  };

  const discardActiveWorkout = async () => {
    const workoutId = discardWorkoutId;
    if (!workoutId || discardingWorkout) return;
    setDiscardingWorkout(true);
    setDiscardWorkoutError("");
    try {
      await api<{ ok: true; workoutId: string }>(`/api/workouts/${workoutId}/discard`, {
        method: "POST",
      });
      setActiveWorkoutId(null);
      setActiveRoutineName("");
      setActiveExercises([]);
      setActiveResume(null);
      setActiveWorkoutDetailsOpen(false);
      setDiscardDialogOpen(false);
      setDiscardWorkoutId(null);
      setScreen("home");
      setNotice("Тренировка завершена без сохранения");
      setHomeStatus("ready");
      setDiscardingWorkout(false);
      const historySteps = overlayHistoryDepthRef.current;
      overlayHistoryDepthRef.current = 0;
      window.setTimeout(() => {
        if (window.history.state?.formaOverlay && historySteps > 0) {
          window.history.go(-historySteps);
        }
      }, 0);
      await loadHomeData(false);
      window.requestAnimationFrame(() => workoutPickerTriggerRef.current?.focus());
    } catch {
      setDiscardWorkoutError(
        "Не удалось завершить тренировку. Проверьте соединение и попробуйте снова.",
      );
      setDiscardingWorkout(false);
    }
  };

  const startOverlayDrag = (event: React.PointerEvent) => {
    overlayDragStartRef.current = event.clientY;
  };

  const finishOverlayDrag = (event: React.PointerEvent, close: () => void) => {
    const start = overlayDragStartRef.current;
    overlayDragStartRef.current = null;
    if (start !== null && event.clientY - start >= 60) close();
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
          progression: currentExercise.defaultProgression,
          setNumber,
          targetValue: currentExercise.target,
          actualValue,
          unit: currentExercise.unit,
        }),
      });
      const nextResume = setNumber < currentExercise.sets
        ? { exerciseIndex, setNumber: setNumber + 1 }
        : exerciseIndex < activeExercises.length - 1
          ? { exerciseIndex: exerciseIndex + 1, setNumber: 1 }
          : null;
      setActiveResume(nextResume);
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
          progression: lastSet.exercise.defaultProgression,
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
      await completeActiveWorkout();
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
    setActiveResume(null);
    setActiveWorkoutDetailsOpen(false);
    setDiscardDialogOpen(false);
    setDiscardWorkoutId(null);
    setDiscardWorkoutError("");
    setDiscardingWorkout(false);
    setNotice("");
    setHomeStatus("loading");
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
      setScreen(workoutEntry);
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
                  <button onClick={() => { setScreen("routines"); setHomeMenuOpen(false); }}>Мои тренировки</button>
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
                <h1>{currentExercise.name}:<br /><em>{currentExercise.defaultProgression}</em></h1>
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
          {notice && user && (
            <button className="toast success-toast" onClick={() => setNotice("")} role="status">
              {notice} ×
            </button>
          )}
        </div>

        {screen === "home" && (
          <div className="screen-action home-workout-action">
            {homeStatus === "error" && (
              <div className="home-action-error" role="alert">
                <span>{homeError}</span>
                <button onClick={() => void loadHomeData()}>Повторить</button>
              </div>
            )}
            {homeStatus === "loading" && (
              <div className="active-workout-skeleton" aria-label="Загружается активная тренировка">
                <span />
                <span />
                <span />
              </div>
            )}
            {homeStatus === "ready" && activeWorkoutId && (
              <button
                ref={activeWorkoutCardRef}
                className="active-workout-card"
                disabled={discardingWorkout}
                aria-label={`Посмотреть состав активной тренировки ${activeRoutineName || "Активная тренировка"}`}
                onClick={openActiveWorkoutDetails}
              >
                <span className="active-workout-card-copy">
                  <small>Сейчас выполняется</small>
                  <strong>{activeRoutineName || "Активная тренировка"}</strong>
                  <span>
                    {activeResume && resumeExercise
                      ? `Продолжим: ${resumeExercise.name} · подход ${activeResume.setNumber} из ${resumeExercise.sets}`
                      : "Все подходы выполнены"}
                  </span>
                </span>
                <i aria-hidden="true">›</i>
              </button>
            )}
            <button
              ref={workoutPickerTriggerRef}
              disabled={homeStatus !== "ready" || resumingWorkout || Boolean(startingRoutineId) || discardingWorkout}
              className="primary-button"
              aria-describedby={homeStatus === "ready" && activeWorkoutId ? "active-workout-name" : undefined}
              onClick={homeStatus === "ready" && activeWorkoutId
                ? () => void resumeWorkout()
                : () => {
                    setWorkoutPickerError("");
                    setWorkoutPickerOpen(true);
                  }}
            >
              {homeStatus === "ready" && activeWorkoutId ? "Продолжить тренировку" : "Начать тренировку"}
            </button>
            {homeStatus === "ready" && activeWorkoutId && (
              <>
                <button
                  className="discard-workout-link"
                  disabled={discardingWorkout}
                  onClick={() => openDiscardDialog(false)}
                >
                  Завершить без сохранения
                </button>
                <span id="active-workout-name" className="visually-hidden">
                  Активная тренировка: {activeRoutineName || "Активная тренировка"}
                </span>
              </>
            )}
          </div>
        )}
        {screen === "routines" && (
          <div className="screen-action">
            <button className="primary-button" onClick={() => createRoutine("routines")}>＋ Новый набор</button>
          </div>
        )}
        {screen === "routine" && selectedRoutine && (
          <div className="screen-action">
            <button
              disabled={busy || Boolean(startingRoutineId)}
              className="primary-button"
              onClick={() => void startWorkout(selectedRoutine.id, "routine")}
            >
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

      {activeWorkoutDetailsOpen && activeWorkoutId && (
        <div
          className="modal-backdrop active-workout-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeActiveWorkoutDetails();
          }}
        >
          <section
            ref={activeWorkoutDetailsRef}
            className="active-workout-details"
            role="dialog"
            aria-modal="true"
            aria-labelledby="active-workout-details-title"
            aria-describedby="active-workout-details-summary"
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              className="sheet-handle"
              aria-hidden="true"
              onPointerDown={startOverlayDrag}
              onPointerUp={(event) => finishOverlayDrag(event, closeActiveWorkoutDetails)}
            />
            <div className="active-workout-details-heading">
              <div>
                <span className="eyebrow">Активная тренировка</span>
                <h2
                  ref={activeWorkoutDetailsTitleRef}
                  id="active-workout-details-title"
                  tabIndex={-1}
                >
                  {activeRoutineName || "Активная тренировка"}
                </h2>
                <p id="active-workout-details-summary">
                  Выполнено {completedExerciseCount} из {activeExercises.length} упражнений
                </p>
              </div>
              <button
                className="sheet-close-button"
                onClick={closeActiveWorkoutDetails}
                aria-label="Закрыть состав"
              >
                ×
              </button>
            </div>
            <div className="active-workout-exercise-list">
              {activeExercises.map((exercise, index) => {
                const state = activeExerciseStates[index];
                return (
                  <article
                    key={`${exercise.key}:${index}`}
                    className={`active-workout-exercise ${state}`}
                    aria-label={state === "current" ? `Текущее упражнение. ${exercise.name}` : undefined}
                  >
                    <span className="active-exercise-mark" aria-hidden="true">
                      {state === "completed" ? "✓" : index + 1}
                    </span>
                    <span className="exercise-icon" aria-hidden="true">{exercise.icon}</span>
                    <span className="active-exercise-copy">
                      <strong>{exercise.name}</strong>
                      <small>
                        {state === "completed" && "Выполнено"}
                        {state === "current" && activeResume
                          ? `Продолжим отсюда · подход ${activeResume.setNumber} из ${exercise.sets}`
                          : null}
                        {state === "upcoming"
                          ? `${exercise.sets} × ${exercise.target} ${exercise.unit}`
                          : null}
                      </small>
                    </span>
                  </article>
                );
              })}
            </div>
            <div className="active-workout-details-actions">
              <button
                className="primary-button"
                disabled={resumingWorkout || discardingWorkout}
                onClick={() => {
                  setActiveWorkoutDetailsOpen(false);
                  if (window.history.state?.formaOverlay === "active-workout-details") {
                    overlayHistoryDepthRef.current = 0;
                    window.history.back();
                  }
                  void resumeWorkout();
                }}
              >
                {activeResume
                  ? `Продолжить: подход ${activeResume.setNumber}`
                  : "Завершить тренировку"}
              </button>
              <button
                className="discard-workout-link"
                disabled={discardingWorkout}
                onClick={() => openDiscardDialog(true)}
              >
                Завершить без сохранения
              </button>
            </div>
          </section>
        </div>
      )}

      {discardDialogOpen && discardWorkoutId && (
        <div
          className="modal-backdrop discard-workout-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDiscardDialog();
          }}
        >
          <section
            ref={discardDialogRef}
            className="discard-workout-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-workout-title"
            aria-describedby="discard-workout-description"
            aria-busy={discardingWorkout}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              className="sheet-handle"
              aria-hidden="true"
              onPointerDown={startOverlayDrag}
              onPointerUp={(event) => finishOverlayDrag(event, closeDiscardDialog)}
            />
            <span className="discard-workout-icon" aria-hidden="true">!</span>
            <h2 id="discard-workout-title">Завершить тренировку?</h2>
            <p id="discard-workout-description">
              Текущий прогресс не сохранится в истории и статистике. Это действие нельзя отменить.
            </p>
            {discardWorkoutError && (
              <p className="discard-workout-error" role="alert">{discardWorkoutError}</p>
            )}
            <div className="discard-workout-actions">
              <button
                className="danger-confirm-button"
                disabled={discardingWorkout}
                onClick={() => void discardActiveWorkout()}
              >
                {discardingWorkout
                  ? "Завершаем…"
                  : discardWorkoutError
                    ? "Попробовать снова"
                    : "Завершить без сохранения"}
              </button>
              <button
                ref={discardSafeActionRef}
                className="secondary-button"
                disabled={discardingWorkout}
                onClick={closeDiscardDialog}
              >
                Продолжить тренировку
              </button>
            </div>
            <span className="visually-hidden" aria-live="polite">
              {discardingWorkout ? "Завершение тренировки выполняется" : ""}
            </span>
          </section>
        </div>
      )}

      {workoutPickerOpen && (
        <div className="modal-backdrop workout-picker-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWorkoutPicker();
        }}>
          <section
            ref={workoutPickerRef}
            className="workout-picker-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workout-picker-title"
            tabIndex={-1}
          >
            <div className="sheet-handle" />
            <div className="workout-picker-heading">
              <div>
                <h2 id="workout-picker-title">Выбери тренировку</h2>
                <p>Нажми на набор, чтобы сразу начать.</p>
              </div>
              <button className="sheet-close-button" onClick={closeWorkoutPicker} aria-label="Закрыть">×</button>
            </div>
            {workoutPickerError && <p className="picker-error" role="alert">{workoutPickerError}</p>}
            {routines.length > 0 ? (
              <div className="workout-picker-list">
                {routines.map((routine) => {
                  const isStarting = startingRoutineId === routine.id;
                  return (
                    <button
                      key={routine.id}
                      className="workout-picker-card"
                      disabled={Boolean(startingRoutineId)}
                      onClick={() => void startWorkout(routine.id, "home")}
                    >
                      <span className="routine-icon">
                        {EXERCISES_BY_KEY[routine.exerciseKeys[0]]?.icon ?? "＋"}
                      </span>
                      <span className="routine-copy">
                        <strong>{routine.name}</strong>
                        <small>{exerciseCountLabel(routine.exerciseKeys.length)} · {routine.durationMinutes} мин</small>
                        <i className={`difficulty ${routine.difficulty}`}>{difficultyLabel[routine.difficulty]}</i>
                      </span>
                      <span className={`workout-start-mark ${isStarting ? "loading" : ""}`} aria-hidden="true">
                        {isStarting ? "…" : "▶"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="workout-picker-empty">
                <strong>У вас пока нет тренировок</strong>
                <p>Создайте первый набор упражнений, чтобы начать.</p>
              </div>
            )}
            <button
              className={routines.length > 0 ? "secondary-button" : "primary-button"}
              disabled={Boolean(startingRoutineId)}
              onClick={() => {
                setWorkoutPickerOpen(false);
                if (routines.length === 0) createRoutine("routines");
                else setScreen("routines");
              }}
            >
              {routines.length > 0 ? "Управлять наборами" : "Создать тренировку"}
            </button>
          </section>
        </div>
      )}

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
            <p>Набор исчезнет из общего списка. Активная и завершённые тренировки останутся доступны.</p>
            <button className="danger-confirm-button" disabled={busy} onClick={deleteRoutine}>Удалить набор</button>
            <button className="secondary-button" onClick={() => setDeleteConfirmOpen(false)}>Отмена</button>
          </section>
        </div>
      )}
    </main>
  );
}
