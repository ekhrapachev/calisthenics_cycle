# Handoff для реализации

## Изменения интерфейса

В `app/FormaApp.tsx`:

- заменить вычисление `streak` на `lastCompletedAt`;
- сделать карточку общего числа одной кнопкой перехода в `history`;
- заменить вторую stat-card на дату последней тренировки;
- добавить состояние выбранного для проверки routine;
- изменить обработчик карточки picker: открыть preview вместо `startWorkout`;
- вызывать `startWorkout` только из CTA preview;
- обеспечить возврат в picker с восстановлением фокуса и scroll.

В `app/globals.css`:

- добавить action-строку истории и интерактивные состояния stat-card;
- использовать один typography token `36px/1/850` для общего счётчика и даты,
  не вводить отдельный уменьшенный стиль для `.date-value`;
- добавить стили полноэкранного preview и закреплённой CTA;
- переиспользовать размеры строк из routine details / active workout details.

## Данные

Сейчас `GET /api/workouts` ограничивает историю 30 записями, поэтому
`history.length` не является надёжным общим счётчиком после 30 тренировок.
Ответ должен отдельно вернуть:

```ts
analytics: {
  totalCompleted: number;
  lastCompletedAt: number | null;
}
```

Запрос строится агрегатами по всем completed-сессиям пользователя.

Для preview рекомендуется отдельное чтение:

```http
GET /api/routines/:id/preview
```

```ts
{
  routine: {
    id: string;
    revision: number;
    name: string;
    durationMinutes: number;
    difficulty: "easy" | "medium" | "hard";
    exercises: SnapshotExercise[];
  }
}
```

`revision` можно начать с `workout_routines.updated_at`. Изменение порядка,
состава или progression selection должно обновлять revision либо учитываться в
отдельном hash, иначе пользователь может подтвердить не тот snapshot, который
видел.

Стартовый запрос:

```http
POST /api/workouts
{
  "routineId": "...",
  "routineRevision": 1721980800000
}
```

При несовпадении вернуть `409 routine_changed` и актуальный preview либо
потребовать повторное чтение.

## Важный инвариант

Preview и snapshot должны собираться одной доменной функцией. Не дублировать
логику применения progression selection в клиенте и start endpoint.

## Совместимость с существующими фичами

- Обновить утверждение `два нажатия` в `quick_start_workout`: новый путь требует
  трёх осознанных действий и подтверждения.
- Сохранить единственность active-сессии и поведение resume.
- `discard_active_workout` не меняется.
- `direct_home_navigation` должен использовать новую композицию stat-card.

## Рекомендуемый порядок

1. Добавить серверную аналитику.
2. Вынести сборку snapshot/preview в общую функцию.
3. Добавить revision validation.
4. Обновить главную и picker.
5. Добавить preview и навигационный back stack.
6. Покрыть unit/API/interaction тестами из `qa.md`.
