# HTTP API Forma

Статус: **TARGET — локальная реализация, не опубликовано**

API обслуживается тем же Cloudflare Worker, что и веб-интерфейс. Все пути
относительны к origin приложения.

## Общие правила

- Формат запросов и ответов: `application/json`.
- Все ответы содержат `Cache-Control: no-store`.
- Защищённые endpoints используют cookie `forma_session`.
- Cookie устанавливается при регистрации и входе; браузер отправляет её на все пути
  origin.
- Временные поля — Unix time в миллисекундах, кроме `durationSeconds`.
- UUID представлены строками.
- Ошибка имеет форму:

```json
{
  "error": "Описание ошибки"
}
```

Типовые статусы:

| Статус | Значение |
|---|---|
| `200` | успешное чтение или изменение |
| `201` | ресурс создан |
| `400` | тело запроса или бизнес-параметры некорректны |
| `401` | нет действующей сессии или неверные credentials |
| `404` | принадлежащий пользователю ресурс не найден |
| `409` | конфликт уникальности email |

Если тело запроса не является корректным JSON, оно интерпретируется как пустое и
обычно приводит к `400` или `401`.

## Типы

```ts
type User = {
  id: string;
  email: string;
  name: string;
  gender: "male" | "female" | "unspecified";
  birthDate: string; // YYYY-MM-DD
};

type Difficulty = "easy" | "medium" | "hard";
type Effort = "easy" | "reserve" | "hard";

type Exercise = {
  key: string;
  name: string;
  icon: string;
  category: "push" | "pull" | "core";
  muscles: string;
  sets: number;
  target: number;
  unit: "повтора" | "сек";
  progressions: string[];
  defaultProgression: string;
};

type Routine = {
  id: string;
  name: string;
  durationMinutes: number;
  difficulty: Difficulty;
  exerciseKeys: string[];
  createdAt?: number;
  updatedAt: number;
};
```

## Аутентификация

### `POST /api/auth/register`

Создаёт пользователя и сразу открывает сессию.

Тело:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Иван",
  "gender": "male",
  "birthDate": "1995-08-17"
}
```

Ограничения:

- email нормализуется через `trim().toLowerCase()` и проверяется на базовый формат;
- пароль — минимум 8 символов;
- имя после `trim()` не должно быть пустым;
- `gender`: `male`, `female` или `unspecified`;
- `birthDate` должен соответствовать форме `YYYY-MM-DD`; календарная валидность
  даты отдельно не проверяется.

Успех: `201`, заголовок `Set-Cookie` и:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Иван",
    "gender": "male",
    "birthDate": "1995-08-17"
  }
}
```

Конфликт email: `409`.

### `POST /api/auth/login`

Проверяет email и пароль, создаёт новую сессию.

Тело:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Успех: `200`, `Set-Cookie` и `{ "user": User }`.

Неверный формат email, пустой пароль, неизвестный пользователь и неверный пароль
дают одинаковый ответ `401`.

### `POST /api/auth/logout`

Удаляет текущую сессию, если cookie присутствует, и очищает cookie в браузере.
Endpoint не требует действующей сессии.

Успех:

```json
{ "ok": true }
```

### `GET /api/auth/me`

Возвращает пользователя текущей сессии.

- `200`: `{ "user": User }`;
- `401`: `{ "user": null }`.

### `POST /api/auth/forgot-password`

Создаёт одночасовой reset token для существующего аккаунта. Ответ намеренно не
показывает, существует ли email.

Тело:

```json
{ "email": "user@example.com" }
```

- неверный формат email: `400`;
- корректный формат: `200`, `{ "ok": true }`.

Отправка письма и endpoint установки нового пароля в текущей версии отсутствуют.

## Наборы тренировок

Все endpoints этого раздела требуют сессию.

### `GET /api/routines`

Возвращает наборы пользователя в порядке создания:

```json
{
  "routines": [
    {
      "id": "uuid",
      "name": "Push day",
      "durationMinutes": 35,
      "difficulty": "medium",
      "createdAt": 1785050000000,
      "updatedAt": 1785050000000,
      "exerciseKeys": ["dips", "handstand-push-up"]
    }
  ]
}
```

Первый вызов также создаёт три стартовых набора, если профиль наборов ещё не был
инициализирован.

### `POST /api/routines`

Создаёт новый набор. Перед созданием также выполняется одноразовая инициализация
стартовых наборов.

Тело:

```json
{
  "name": "Сила верха",
  "durationMinutes": 40,
  "difficulty": "hard",
  "exerciseKeys": ["muscle-up", "high-pull", "front-lever"]
}
```

Ограничения:

- имя: 1–80 символов после `trim()`;
- длительность: целое число от 5 до 240 минут;
- сложность: `easy`, `medium` или `hard`;
- минимум одно упражнение;
- каждый ключ должен существовать в статическом каталоге;
- повторяющиеся ключи удаляются с сохранением порядка первого появления.

Успех: `201`, `{ "routine": Routine }`.

### `PUT /api/routines/:id`

Полностью заменяет изменяемые поля набора и порядок упражнений. Тело и валидация
совпадают с `POST /api/routines`.

Успех: `200`, `{ "routine": Routine }`. В ответе нет `createdAt`.

Чужой или неизвестный `id`: `404`.

### `DELETE /api/routines/:id`

Удаляет набор и выбранные для него прогрессии. Связанные строки
`workout_routine_exercises` удаляются каскадно. Snapshot ранее начатых тренировок
сохраняется.

Успех:

```json
{ "ok": true }
```

Чужой или неизвестный `id`: `404`.

## Прогрессии

### `GET /api/progressions`

Возвращает прогрессии, сохранённые для наборов текущего пользователя:

```json
{
  "progressions": [
    {
      "routineId": "uuid",
      "exerciseKey": "dips",
      "progression": "С дополнительным весом"
    }
  ]
}
```

Значения по умолчанию из каталога не включаются, пока пользователь их явно не
сохранил.

### `PUT /api/progressions`

Создаёт или заменяет выбранную прогрессию упражнения в конкретном наборе.

```json
{
  "routineId": "uuid",
  "exerciseKey": "dips",
  "progression": "С дополнительным весом"
}
```

`routineId`, `exerciseKey` и `progression` должны быть непустыми. Упражнение должно
находиться в принадлежащем пользователю наборе. Сервер не сверяет строку
`progression` со списком допустимых прогрессий каталога.

Успех:

```json
{
  "ok": true,
  "progression": "С дополнительным весом"
}
```

Если упражнение не найдено в наборе: `404`.

## Тренировки

### `GET /api/workouts`

Возвращает состояние активной тренировки и историю среди 30 последних сессий:

```json
{
  "active": {
    "id": "uuid",
    "workoutType": "routine",
    "status": "active",
    "startedAt": 1785050000000,
    "completedAt": null,
    "durationSeconds": null,
    "setCount": 2,
    "routineId": "uuid",
    "routineName": "Push day",
    "durationMinutes": 35,
    "difficulty": "medium",
    "exercises": [],
    "resume": {
      "exerciseIndex": 1,
      "setNumber": 2
    }
  },
  "history": [
    {
      "id": "uuid",
      "workoutType": "routine",
      "status": "completed",
      "startedAt": 1785040000000,
      "completedAt": 1785042400000,
      "durationSeconds": 2400,
      "setCount": 16,
      "routineId": "uuid",
      "routineName": "Push day",
      "durationMinutes": 35,
      "difficulty": "medium",
      "exercises": []
    }
  ]
}
```

`exercises` содержит полный массив `Exercise` из snapshot. `active.resume`
указывает первую незавершённую пару упражнения и подхода; если все пары уже
сохранены, значение равно `null`. Для старых записей без snapshot сервер пытается
восстановить legacy PUSH/PULL каталог.

### `POST /api/workouts`

Начинает тренировку по набору.

```json
{ "routineId": "uuid" }
```

Если активной тренировки нет, `routineId` обязателен и должен быть непустой
строкой. Если active session уже существует, она возвращается до проверки тела,
поэтому продолжение не требует `routineId`.

Если активной тренировки нет:

- набор должен принадлежать пользователю и содержать хотя бы одно известное
  каталогу упражнение;
- создаются session и snapshot;
- ответ: `201`, `{ "workout": ... }`.

Если активная тренировка уже есть, новая не создаётся: сервер возвращает её с
ответом `200`, включая snapshot и `resume`. В этом случае переданный `routineId`
не влияет на результат. Частичный уникальный индекс по пользователю со статусом
`active` защищает от параллельного создания в разных вкладках; проигравший гонку
запрос читает и возвращает созданную active session.

Новая тренировка:

```json
{
  "workout": {
    "id": "uuid",
    "workoutType": "routine",
    "status": "active",
    "startedAt": 1785050000000,
    "routineId": "uuid",
    "routineName": "Push day",
    "durationMinutes": 35,
    "difficulty": "medium",
    "exercises": [],
    "resume": {
      "exerciseIndex": 0,
      "setNumber": 1
    }
  }
}
```

### `POST /api/workouts/:id/sets`

Создаёт подход или обновляет подход с теми же `workoutSessionId`,
`exerciseKey` и `setNumber`.

```json
{
  "exerciseKey": "dips",
  "progression": "С весом тела",
  "setNumber": 1,
  "targetValue": 8,
  "actualValue": 7,
  "unit": "повтора",
  "effort": "reserve"
}
```

Ограничения:

- `exerciseKey`, `progression`, `unit` — непустые строки;
- `setNumber` — целое число не меньше 1;
- `targetValue` и `actualValue` — конечные числа, при сохранении округляются;
- `effort` необязателен: `easy`, `reserve`, `hard` или `null`;
- тренировка должна принадлежать пользователю и иметь статус `active`.

При повторной записи обновляются `progression`, `actualValue`, `completedAt` и,
если передан ненулевой `effort`, оценка усилия. Сохранённые `targetValue` и `unit`
при конфликте не меняются.

Успех: `200`, `{ "ok": true }`.

### `POST /api/workouts/:id/complete`

Завершает принадлежащую пользователю активную тренировку. Тело не требуется.
Длительность вычисляется сервером как время между `startedAt` и текущим моментом,
с минимумом в одну секунду.

Успех:

```json
{
  "workout": {
    "id": "uuid",
    "status": "completed",
    "completedAt": 1785052400000,
    "durationSeconds": 2400,
    "setCount": 16
  }
}
```

Неизвестная или уже завершённая тренировка: `404`.
