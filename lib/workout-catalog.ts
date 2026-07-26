export type ExerciseCategory = "push" | "pull" | "core";

export type Exercise = {
  key: string;
  name: string;
  icon: string;
  category: ExerciseCategory;
  muscles: string;
  sets: number;
  target: number;
  unit: "повтора" | "сек";
  progressions: string[];
  defaultProgression: string;
};

export const EXERCISE_CATALOG: Exercise[] = [
  {
    key: "dips",
    name: "Отжимания на брусьях",
    icon: "∏",
    category: "push",
    muscles: "Грудь · Трицепс",
    sets: 4,
    target: 8,
    unit: "повтора",
    progressions: ["С резиной", "С весом тела", "С дополнительным весом"],
    defaultProgression: "С весом тела",
  },
  {
    key: "band-push-up",
    name: "Отжимания с резиной",
    icon: "⌁",
    category: "push",
    muscles: "Грудь · Плечи",
    sets: 3,
    target: 12,
    unit: "повтора",
    progressions: ["Лёгкая резина", "Средняя резина", "Тяжёлая резина"],
    defaultProgression: "Средняя резина",
  },
  {
    key: "handstand-push-up",
    name: "Отжимания в стойке",
    icon: "↥",
    category: "push",
    muscles: "Плечи · Трицепс",
    sets: 4,
    target: 5,
    unit: "повтора",
    progressions: ["У стены", "На паралетсах", "Свободные"],
    defaultProgression: "У стены",
  },
  {
    key: "diamond-push-up",
    name: "Алмазные отжимания",
    icon: "◇",
    category: "push",
    muscles: "Грудь · Трицепс",
    sets: 3,
    target: 10,
    unit: "повтора",
    progressions: ["С колен", "Классические", "С ногами на опоре"],
    defaultProgression: "Классические",
  },
  {
    key: "muscle-up",
    name: "Выход силой",
    icon: "↟",
    category: "pull",
    muscles: "Спина · Руки",
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
    category: "pull",
    muscles: "Спина · Бицепс",
    sets: 4,
    target: 5,
    unit: "повтора",
    progressions: ["До груди", "До солнечного сплетения", "До пояса"],
    defaultProgression: "До груди",
  },
  {
    key: "australian-pull-up",
    name: "Австралийские подтягивания",
    icon: "⌐",
    category: "pull",
    muscles: "Спина",
    sets: 3,
    target: 12,
    unit: "повтора",
    progressions: ["Высокая перекладина", "Низкая перекладина", "Ноги на опоре"],
    defaultProgression: "Низкая перекладина",
  },
  {
    key: "front-lever",
    name: "Передний вис",
    icon: "↦",
    category: "pull",
    muscles: "Спина · Кор",
    sets: 3,
    target: 10,
    unit: "сек",
    progressions: ["Группировка", "Одна нога", "Полный вис"],
    defaultProgression: "Группировка",
  },
  {
    key: "wall-handstand",
    name: "Стойка у стены",
    icon: "↯",
    category: "core",
    muscles: "Плечи · Кор",
    sets: 4,
    target: 30,
    unit: "сек",
    progressions: ["Лицом от стены", "Лицом к стене", "Без стены"],
    defaultProgression: "Лицом к стене",
  },
  {
    key: "hanging-knee-raise",
    name: "Подъём коленей в висе",
    icon: "∪",
    category: "core",
    muscles: "Кор",
    sets: 3,
    target: 12,
    unit: "повтора",
    progressions: ["Согнутые колени", "До угла", "Прямые ноги"],
    defaultProgression: "Согнутые колени",
  },
  {
    key: "planche",
    name: "Планш",
    icon: "⌜",
    category: "core",
    muscles: "Кор · Плечи",
    sets: 3,
    target: 10,
    unit: "сек",
    progressions: ["Лин", "Группировка", "Стреддл"],
    defaultProgression: "Группировка",
  },
];

export const EXERCISES_BY_KEY = Object.fromEntries(
  EXERCISE_CATALOG.map((exercise) => [exercise.key, exercise]),
) as Record<string, Exercise>;

export const DEFAULT_ROUTINES = [
  {
    name: "Push day",
    durationMinutes: 35,
    difficulty: "medium",
    exerciseKeys: ["dips", "band-push-up", "handstand-push-up", "diamond-push-up", "planche"],
  },
  {
    name: "Morning routine",
    durationMinutes: 18,
    difficulty: "easy",
    exerciseKeys: [
      "wall-handstand",
      "hanging-knee-raise",
      "australian-pull-up",
      "diamond-push-up",
      "band-push-up",
      "front-lever",
    ],
  },
  {
    name: "Pull + core",
    durationMinutes: 28,
    difficulty: "hard",
    exerciseKeys: ["muscle-up", "high-pull", "front-lever", "hanging-knee-raise"],
  },
] as const;
