# sf-frontend

Front end for the [Contacts API](http://127.0.0.1:8000/docs) — browse, search, sort,
page through, create, edit, and delete contacts.

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Zod · Jest + Testing Library
+ MSW · Playwright.

## Getting started

```bash
npm install
npx playwright install              # once, for e2e browsers
cp .env.local.example .env.local    # then set API_BASE_URL
npm run dev                         # http://localhost:3000 -> /contacts
```

The backend must be running (default `http://127.0.0.1:8000`). If it is not, the
list page says so rather than blowing up, and the header badge shows
`api unreachable`.

## What you should see

Use these two screenshots as the smoke test. If `http://localhost:3000` looks
like this and the badge reads `api ok`, the frontend, the API, and the database
are all wired up correctly and you can start building.

### `/contacts` — the list

![The contacts list page](docs/UI.png)

The landing route (`/` redirects here). What to check, top to bottom:

- **Header** — `SFContacts` wordmark, `Contacts` / `New contact` nav with the
  current route highlighted, and the theme toggle on the right (dark is the
  default; the sun icon switches to light).
- **`3 contacts` + the badge** — the count comes from the API's `total`, and the
  green-dotted `api ok · sqlite` pill is live `GET /health` output naming the
  backend's database. A red `api unreachable` here means the backend is down or
  `API_BASE_URL` is wrong — everything below it will be empty.
- **Toolbar** — search across name, email, company, and phone, plus a per-page
  selector. Both write to the URL, so the state survives a reload and is
  shareable.
- **Table** — sortable `Name` and `Email` headers (the arrow shows the active
  column and direction), an initials avatar per row, `Job title at Company` as
  the subtitle, and per-row pencil (edit) and trash (delete) actions.
- **Footer row** — `Showing 1–3 of 3` with Previous/Next, both disabled on a
  single page.
- **Version stamp** — `web v0.1.0 (build 2 · 8ce2dc0)` at the bottom of every
  page, so you always know which build you are looking at.

The seed data above (Grace Hopper, Ada Lovelace, Alan Turing) is whatever your
backend was seeded with — your names and IDs will differ, and an empty table
just means an empty database, not a broken app.

### `/contacts/[id]` — a single contact

![A single contact's detail page](docs/contact.png)

Click a row to get here. It confirms the detail read path works end to end:

- **`< All contacts`** back link to the list.
- **Header** — avatar, name, and `Job title at Company`, with **Edit**
  (`/contacts/[id]/edit`) and a destructive **Delete** that asks before it acts.
- **Field table** — email and phone rendered as `mailto:` / `tel:` links, then
  company, job title, address, and notes. Empty optional fields show `—` rather
  than collapsing, so the shape of the record stays readable.
- **Metadata table** — `ID`, `Created`, and `Last updated` in UTC, monospaced.

Hand-editing the URL to an ID that does not exist gives you the styled 404 page
(`src/app/not-found.tsx`), not a stack trace — that is also worth a quick try.

## Scripts

| Script                    | What it does                                        |
| ------------------------- | --------------------------------------------------- |
| `npm run dev`             | Dev server with fast refresh                         |
| `npm run build`           | Production build                                     |
| `npm start`               | Serve the production build                           |
| `npm run lint`            | ESLint (flat config, `eslint-config-next`)           |
| `npm run typecheck`       | `tsc --noEmit`                                       |
| `npm test`                | Jest unit/component tests                            |
| `npm run test:watch`      | Jest in watch mode                                   |
| `npm run test:coverage`   | Jest with coverage (thresholds in `jest.config.ts`)  |
| `npm run test:e2e`        | Playwright — starts the dev server itself            |
| `npm run test:e2e:ui`     | Playwright UI mode                                   |
| `npm run test:e2e:report` | Open the last HTML report                            |

## Routes

| Route                | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `/`                  | 308 to `/contacts` (a `redirects()` rule, not a page)             |
| `/contacts`          | List: search, sort, paginate — all held in the URL                |
| `/contacts/new`      | Create form                                                       |
| `/contacts/[id]`     | Detail view with edit/delete                                      |
| `/contacts/[id]/edit`| Edit form (`PUT`, i.e. a full replacement)                        |

## Layout

```
src/app/contacts/(list)/  List page + its loading skeleton
src/app/contacts/         Detail, edit, create routes and the server actions
src/components/contacts/  Feature components (table, toolbar, form, avatar…)
src/components/ui/        Button and Field primitives
src/lib/contacts/         Types, Zod schema, API access, URL query helpers
src/lib/apiClient.ts      fetch wrapper: base URL, ApiError, ApiUnreachableError
src/__tests__/            Jest tests + MSW handlers, mirroring the src/ tree
e2e/                      Playwright specs (run against the real API)
```

`@/*` maps to `src/*` in both TypeScript and Jest.

## How it talks to the API

- **Server-side only.** Reads happen in server components, writes in server
  actions (`src/app/contacts/actions.ts`). `API_BASE_URL` never reaches the
  browser, there is no CORS surface, and no loading waterfall on first paint.
  That means the app needs a Node runtime — `output: "export"` is not supported.
- **`src/lib/contacts/api.ts`** is the only module that knows the endpoint
  shapes. It mirrors `/openapi.json`: `GET /api/v1/contacts` (search, limit,
  offset, sort_by, order), `POST`, `GET|PUT|PATCH|DELETE /api/v1/contacts/{id}`,
  and `GET /health`.
- **Errors are typed, not swallowed.** `404` becomes `null` (→ the 404 page),
  `409` becomes a field error on email, `422` is unpacked from FastAPI's
  `HTTPValidationError` into per-field messages, and an unreachable backend
  becomes `ApiUnreachableError` with a panel that names the URL it tried.
- **List state lives in the URL** (`?q=&sort=&order=&page=&perPage=`), parsed and
  sanitised by `src/lib/contacts/query.ts`. Sorting is validated against the
  API's allow-list, so a hand-edited URL can never produce a 422.

## Conventions

- **Forms** — one source of truth: `CONTACT_FIELD_GROUPS` in
  `src/lib/contacts/schema.ts` drives both the rendered fields and the Zod rules,
  which mirror the API's own limits. Submitting is a real form `action`, so it
  works before hydration; `useActionState` surfaces what comes back.
- **Styling** — Tailwind against semantic CSS variables (`bg-background`,
  `text-muted-foreground`, `border-hairline`, …) defined in `src/app/globals.css`.
  Dark is the default; light lives under `[data-theme="light"]`. Add colours as
  tokens there plus an entry in `tailwind.config.ts` rather than hard-coding hex
  values in components, so both themes stay in sync.
- **Fonts** — Inter / Space Grotesk / JetBrains Mono are self-hosted under
  `src/app/fonts/` via `next/font/local`, so builds never fetch Google Fonts.
- **Version stamp** — `next.config.ts` injects `NEXT_PUBLIC_APP_VERSION`,
  `NEXT_PUBLIC_BUILD_NUMBER` (CI `BUILD_NUMBER`, else git commit count), and
  `NEXT_PUBLIC_GIT_SHA`. `VersionFooter` renders them, so any deployed page shows
  exactly which build it is.
- **Suspense boundaries change HTTP status.** The list skeleton sits in the
  `(list)` route group on purpose: a `loading.tsx` directly under `contacts/`
  would also wrap `[id]`, flush the shell early, and turn its `notFound()` 404
  into a 200.
- **Tests** — HTTP is stubbed with MSW (`src/__tests__/mocks/`), never by mocking
  `fetch` directly. Query by role/label over test IDs. Three bits of
  `jest.config.ts`/`jest.setup.ts` exist purely to make this stack work under
  Jest and should not be removed casually: the `jest-fixed-jsdom` environment
  (keeps Node's `fetch`/`Request`/stream globals, which plain jsdom strips), the
  `transformIgnorePatterns` override (MSW's dependency tree is ESM-only), the
  `server-only` module mapping, and the `FormData` shim (undici's `FormData`
  cannot be built from a `<form>`, which is what React 19 does on submit).

## End-to-end tests

`e2e/` runs against a **real** backend: each test creates its own contact with a
unique email and deletes it again. Playwright's default is three browsers in
parallel with up to 8 workers; if your backend is a single-worker uvicorn on
in-memory SQLite, that concurrency can wedge it — run `npm run test:e2e --
--workers=2` (or `--project=chromium`) against a dev backend you don't mind
restarting.

## Deployment

Standard Node server build: `npm run build && npm start`. Set `API_BASE_URL` in
the server environment to wherever the Contacts API lives.
