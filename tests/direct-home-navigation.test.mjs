import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../app/FormaApp.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("home exposes direct, single-button navigation to history, routines, and profile", () => {
  assert.match(appSource, /aria-label=\{`Открыть историю тренировок, всего \$\{stats\.totalCompleted\}`\}/);
  assert.match(appSource, /className="stat-action"[\s\S]*История[\s\S]*className="nav-chevron"/);
  assert.match(appSource, /className="constructor-card"[\s\S]*aria-label="Открыть конструктор тренировок"/);
  assert.match(appSource, /className="icon-button profile-button"[\s\S]*aria-label="Открыть профиль"/);
  assert.doesNotMatch(appSource, /homeMenuOpen|home-menu|more-button|Открыть меню/);
  assert.doesNotMatch(appSource, /История <i>→/);
});

test("routines uses the constructor name and workout CTA", () => {
  assert.match(appSource, /<h1>Конструктор тренировок<\/h1>/);
  assert.match(appSource, />＋ Новая тренировка<\/button>/);
  assert.doesNotMatch(appSource, /Мои тренировки/);
});

test("navigation chevrons share the required visual token", () => {
  assert.match(styles, /\.nav-chevron\s*\{[\s\S]*font-size:\s*27px;[\s\S]*font-weight:\s*300;[\s\S]*line-height:\s*1;/);
  assert.match(styles, /\.stat-action \.nav-chevron\s*\{[\s\S]*place-items:\s*center;/);
  assert.match(appSource, /className="stat-action"[\s\S]*className="nav-chevron" aria-hidden="true">›/);
  assert.match(appSource, /className="constructor-card"[\s\S]*className="nav-chevron" aria-hidden="true">›/);
  assert.match(appSource, /routines\.map[\s\S]*className="nav-chevron" aria-hidden="true">›<\/span>/);
});

test("direct navigation controls meet touch and reduced-motion requirements", () => {
  assert.match(styles, /\.icon-button\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px;/);
  assert.match(styles, /\.constructor-card\s*\{[\s\S]*min-height:\s*76px;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.history-stat-card:active,[\s\S]*\.constructor-card:active\s*\{\s*transform:\s*none;/);
});
