# Handoff для реализации

Фича: `discard_active_workout`

## Затрагиваемые файлы

- `app/FormaApp.tsx` — карточка активной тренировки, sheet состава, состояния
  подтверждения, запрос отказа и очистка активной тренировки;
- `app/globals.css` — карточка, список состава, текущая строка, вторичное
  действие и destructive-состояние диалога;
- новый `app/api/workouts/[id]/discard/route.ts` — отказ от активной сессии;
- `docs/engineering/api.md` — контракт нового endpoint;
- тесты API и пользовательского сценария в принятой проектом структуре.

Изменение `db/schema.ts` и новая миграция не требуются.

## API

Новый `POST /api/workouts/:id/discard` должен:

1. получить пользователя через `requireUser`;
2. выполнить один параметризованный запрос:

   ```sql
   DELETE FROM workout_sessions
   WHERE id = ?1 AND user_id = ?2 AND status = 'active'
   ```

3. вернуть `200` и `{ "ok": true, "workoutId": id }` независимо от числа
   удалённых строк;
4. полагаться на существующие `ON DELETE CASCADE` для snapshot и подходов.

Одинаковый ответ для уже удалённой, завершённой и не принадлежащей пользователю
сессии обеспечивает безопасный идемпотентный повтор и не раскрывает чужие ID.

## Состояния клиента

Рядом с текущими состояниями активной тренировки добавить:

```ts
const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
const [discardingWorkout, setDiscardingWorkout] = useState(false);
const [discardWorkoutError, setDiscardWorkoutError] = useState("");
const [activeWorkoutDetailsOpen, setActiveWorkoutDetailsOpen] = useState(false);
```

При открытом подтверждении сохранить ID активной сессии, к которой относится
действие. Не брать новый `activeWorkoutId` после начала запроса.

После успешного ответа:

- очистить `activeWorkoutId`, `activeRoutineName`, `activeExercises` и
  `activeResume`;
- закрыть диалог;
- оставить пользователя на `home`;
- обновить `/api/workouts`, чтобы D1 оставалась источником истины;
- перевести нижнюю primary-кнопку в состояние `Начать тренировку`;
- показать сообщение `Тренировка завершена без сохранения`.

При ошибке не очищать активное состояние и оставить диалог открытым.

Отдельное состояние данных для sheet не требуется. Использовать существующие:

- `activeRoutineName`;
- `activeExercises`;
- `activeResume`;
- `activeWorkoutId`.

Текущее упражнение:

```ts
const resumeExercise = activeResume
  ? activeExercises[activeResume.exerciseIndex]
  : null;
```

Оба действия продолжения должны вызывать существующий `resumeWorkout()`.

## UI на главной

`.active-workout-summary` заменить на кликабельную карточку с названием,
resume-строкой, прогрессом и chevron. Рядом с названием не добавлять отдельную
иконку редактирования: snapshot неизменяем.

Bottom sheet состава строится из `activeExercises`:

- индекс меньше `activeResume.exerciseIndex` — completed;
- индекс равен `activeResume.exerciseIndex` — current;
- индекс больше — upcoming.

Primary-кнопка `Продолжить тренировку` остаётся главным действием. В карточке
или под ней добавить tertiary-действие `Завершить без сохранения`.

Для подтверждения переиспользовать существующий паттерн `.confirm-dialog`:

- `role="alertdialog"` и `aria-modal="true"`;
- заголовок связан через `aria-labelledby`;
- описание последствий связано через `aria-describedby`;
- безопасное действие получает начальный фокус;
- Escape и закрытие backdrop отменяют действие без изменения данных.

На время запроса заблокировать обе кнопки диалога и повторное открытие.

## API состава

Новый endpoint не нужен. Текущий `GET /api/workouts` уже возвращает для `active`:

- `routineName`;
- `exercises` из snapshot;
- `resume.exerciseIndex`;
- `resume.setNumber`.

Важно не читать актуальный `workout_routines`: он мог быть изменён или удалён
после начала сессии.

## Проверка данных

До запроса сохранить:

- число строк истории из `GET /api/workouts`;
- значения статистики на главной;
- ID активной сессии и число её подходов.

После успеха проверить:

- `active` равен `null`;
- история и статистика не изменились;
- строка `workout_sessions` удалена;
- связанные snapshot и `workout_sets` удалены каскадно;
- новый `POST /api/workouts` создаёт новую активную сессию.

## Документация после реализации

- добавить endpoint в `docs/engineering/api.md`;
- при необходимости уточнить раздел «Жизненный цикл и удаление» в
  `docs/engineering/data-model.md`;
- сменить статус пакета с `proposal` на фактический статус выпуска.
