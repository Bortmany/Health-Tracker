# Cut

Multi-user fat-loss and training tracker. React + Vite frontend, Express + Postgres backend, npm workspaces monorepo.

## Status

Phase 1 (skeleton) complete: repo structure, npm workspaces, Express health-check, Postgres connection, migration runner, first migration (`users` + `user_settings`).

## Local development

1. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (a local or Railway Postgres instance) and `JWT_SECRET`.
2. Install dependencies: `npm install` (installs both `apps/api` and `apps/web`).
3. Run migrations: `npm run migrate`.
4. Start both apps: `npm run dev` (API on :3001, web on :5173, Vite proxies `/api` to the API).
5. Confirm `http://localhost:5173` shows `API health: {"status":"ok","db":"connected"}`.

## Repo structure

```
/apps
  /api   Express app (routes, db/migrations, middleware, lib)
  /web   React app (pages, components, api wrappers, hooks)
/docs
  schema.sql   always-current full schema dump
```

## Migrations

Plain numbered SQL files in `apps/api/src/db/migrations/`, applied in order by `apps/api/src/db/migrate.js`, tracked in a `schema_migrations` table. No migration framework. Run with `npm run migrate`.

## Deploying to Railway

1. Create a new Railway project, link this repo.
2. Add a Postgres plugin to the project — Railway sets `DATABASE_URL` automatically on the linked service.
3. Add a Node service for the API:
   - Build command: `npm install && npm run build` (builds the web app)
   - Start command: `npm run migrate -w apps/api && npm start -w apps/api`
   - Env vars: `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGIN` (if serving web separately; not needed once Express serves the built web app).
4. In production, Express serves `apps/web/dist` directly so only one Railway service is needed (wired up in a later phase).

## Environment variables

See `.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`.
