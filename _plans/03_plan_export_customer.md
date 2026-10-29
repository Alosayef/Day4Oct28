# Plan 03: Export customers to Excel

Implements: `_specs/03_spec_export_customer.md` (approved)

## Decisions on the open questions

1. Columns are Customer ID, Customer Name and Location; the owner id is not exported.
2. The library is `exceljs`.
3. The search box is ignored; the export always contains all of the user's customers.

## Before starting

- Working tree is committed (CLAUDE.md rule), including spec 03 and this plan.
- No database change, no migration, no new environment variables.

## Steps

### 1. Backend dependency
- `npm i exceljs` in `backend/`. It is pure JavaScript, so it needs no native build on Vercel.

### 2. Export route (`backend/src/routes/customers.js`)
- Add `GET /export` **above** `GET /:id`, so Express does not treat `export` as an id (and `idParam` never sees it).
- Handler:
  - `const rows = await customers.list(req.user.id)`: the existing user-scoped query, so no new SQL and no unscoped path. The `?name=` parameter is not read.
  - Build the workbook with `exceljs`: sheet `Customers`, columns `Customer ID` / `Customer Name` / `Location` with widths set, header row bold, `views: [{ state: 'frozen', ySplit: 1 }]`.
  - Add rows as plain values. Text cells are written as strings (never as `{ formula }` objects), so a value such as `=1+1` is stored as literal text. Check in verification that exceljs does not turn such strings into formulas.
  - Send with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `Content-Disposition: attachment; filename="customers-YYYY-MM-DD.xlsx"` (UTC date), using `await workbook.xlsx.writeBuffer()` and `res.send(Buffer.from(buffer))`. Nothing is written to disk.
  - Errors go to `next(e)`; no customer data is logged.
- Authentication already applies to the whole `/api/customers` mount in `app.js`, so the route gets the `401` for free.

### 3. CORS (`backend/src/app.js`)
- Add `exposedHeaders: ['Content-Disposition']` to the `cors(...)` options so the browser can read the file name.

### 4. Swagger
- JSDoc on the new route, under the `Customers` tag: `bearerAuth`, `200` with `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `schema: { type: string, format: binary }`, the `401` response via `#/components/responses/Unauthorized`, and a short description (only the user's customers, search not applied).

### 5. Frontend
- `api.js`: add `exportCustomers`. It cannot reuse `request`, which parses JSON, so it:
  - calls `fetch` with the `Authorization` header (token never in the URL),
  - on `401` (with a token) calls the existing unauthorized handler, and on any non-OK response throws an `Error` with the server's `error` text,
  - returns `{ blob, filename }`, taking the name from `Content-Disposition` and falling back to `customers.xlsx`.
- `CustomerTable.jsx`: add an **Export to Excel** button in the card header next to the search box. A new `onExport` prop; local `exporting` state disables the button and shows "Exporting…" while it runs.
- `App.jsx` (`Dashboard`): implement `exportToExcel`: call `api.exportCustomers()`, create an object URL, click a temporary `<a download>`, revoke the URL, and show a success or error toast through the existing `notify`. Pass it to `CustomerTable`.
- The admin dashboard is untouched.
- Small CSS only if the header layout needs it (reuse `.btn`).

### 6. Docs
- `README.md`: a short "Export customers" section (button, endpoint, only the user's own customers, file format).

### 7. Verification (maps to the spec's acceptance criteria)
Run locally against the real database with two throwaway sales users, then delete the test data:
- No token gives `401` (1).
- Valid token gives `200`, the `.xlsx` content type and a `customers-YYYY-MM-DD.xlsx` attachment name (2).
- Save the file and read it back with `exceljs` (script in the scratchpad): sheet `Customers`, header cells bold and frozen, correct headers, one row per customer, column widths set (3).
- A creates customers, B creates customers: each file contains only the owner's rows; the legacy unowned customers are in nobody's file (4).
- A user with no customers gets a header-only file that still opens (5).
- A customer named `=1+1`: the cell reads back as the string `=1+1` and has no formula (6).
- Add, edit and delete a customer, then export again: the file reflects each change (7).
- Frontend: `npm run build` and lint, then in the browser check the button downloads a file, is disabled while exporting, a forced failure shows the error toast, and a bad token logs out (8). Browser clicks have been unreliable in this environment, so DOM clicks are used if needed, and the real-click gap is reported.
- `/swagger.json` contains the export path with the binary response (9).

### 8. Commit and deploy
- Scan the diff for secrets, then commit on `main`.
- Deploy needs the user's action: the backend and frontend redeploy from the push (if the Vercel projects are connected to the repo). No new environment variables or migration. Re-run checks 1 to 7 against the deployed backend (criterion 10).

## Risks and notes

- Route order is the main pitfall: if `/export` is placed after `/:id`, the id validator returns `400`. Verification step 2 covers it.
- On Vercel the response is sent as a single buffer. The expected data sizes are tiny, so the function limits are not a concern.
- If `Content-Disposition` is not readable cross-origin for any reason, the frontend falls back to `customers.xlsx`, so the download still works.
- `exceljs` adds a noticeable amount to the backend bundle size; this affects cold-start time slightly and is acceptable here.
- Customers with no owner stay invisible to everyone, including in exports, as in specs 01 and 02.
