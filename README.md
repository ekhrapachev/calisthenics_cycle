# Forma

Full-stack web app for PUSH/PULL calisthenics training. Forma stores accounts,
exercise progressions, completed sets, effort ratings and workout history.

## Stack

- React 19 + Next.js App Router API surface on vinext
- Cloudflare Workers
- Cloudflare D1 + Drizzle migrations
- Email/password sessions in secure HTTP-only cookies

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Production verification:

```bash
npm run typecheck
npm run lint
npm run build
```

## Cloudflare

The Worker is named `forma`; its D1 binding is `DB`, backed by `forma-db`.
Database structure is managed only through the checked-in Drizzle migrations.

Apply database migrations:

```bash
npm run db:migrate:remote
```

For Cloudflare Workers Builds use:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Non-production branch deploy command: `npx wrangler versions upload --config dist/server/wrangler.json`

Each push to `main` is built and deployed automatically after the GitHub
repository is connected under Cloudflare **Workers & Pages → Import a
repository**.
