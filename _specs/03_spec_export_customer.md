# Spec 03: Export customers to Excel

Status: **Draft, awaiting approval** (open questions resolved; the implementation plan goes in `_plans/` once approved)

## 1. Background

A sales user can see and manage their own customers (spec 01), but cannot take the data out of the application. This feature lets a logged-in user download their customers as an Excel file (`.xlsx`).

## 2. Goals

- A logged-in user can export their customers to an Excel file with one click in the UI, or one authenticated API call.
- The file contains **only** the customers owned by the logged-in user, never anyone else's.
- The file opens in Excel (and compatible tools) without warnings or repair prompts.

## 3. Non-goals

- Import from Excel, or export to other formats (CSV, PDF).
- Exporting other users' customers. The admin has no customers of its own, so an admin export is an empty sheet; there is no "export everything" for admins.
- Scheduled or emailed exports, export history, or background jobs.
- Export through the AI agent (no new agent tool).
- Column selection or custom formatting options in the UI.

## 4. Export file

- Format: Excel workbook (`.xlsx`, OOXML), one worksheet named `Customers`.
- The first row is a header row (bold, frozen so it stays visible while scrolling). One row per customer follows.
- Columns:

| Header | Source column | Notes |
|---|---|---|
| Customer ID | `customer_id` | number |
| Customer Name | `customername` | text |
| Location | `location` | text |

- `sales_user_id` is not exported: every row belongs to the same user, so it adds nothing.
- Rows are ordered by `customer_id`, as in the customer list.
- Column widths are set so the content is readable without resizing.
- A user with no customers gets a valid file containing only the header row (not an error).
- File name: `customers-YYYY-MM-DD.xlsx` (the server's current date, UTC), sent in `Content-Disposition`.

### 4.1 Spreadsheet formula safety

Customer names and locations are free text typed by users. A value starting with `=`, `+`, `-` or `@` could run as a formula when opened in Excel. All cells are written as **plain string cells**, never as formulas, so the content is shown literally and cannot execute.

## 5. API

| Method and path | Auth | Description |
|---|---|---|
| `GET /api/customers/export` | required | Returns the logged-in user's customers as an `.xlsx` file. |

- Response `200`, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="customers-YYYY-MM-DD.xlsx"`.
- The `?name=` filter of `GET /api/customers` is **not** supported here: the export always contains all of the user's customers.
- `401` without a valid token (same as the other customer endpoints). Errors keep the shape `{ "error": "message" }`.
- The user id comes only from the verified token. The query uses the existing user-scoped list function (`WHERE sales_user_id = $1`), so there is no unscoped query and no way to request another user's data.
- The route is registered before `GET /api/customers/{id}` so that `export` is not read as an id.
- The file is built in memory and sent in one response; no file is written to disk, which suits Vercel's read-only filesystem.

## 6. Frontend

- The customer screen gets an **Export to Excel** button next to the search box in the customers card header.
- The download uses an authenticated `fetch` (the token goes in the `Authorization` header, never in the URL), turns the response into a blob, and saves it using the file name from `Content-Disposition`.
- While the request runs the button is disabled and reads "Exporting…". On failure a toast shows the error; a `401` logs the user out as for every other call.
- The button is available when the list is empty (it downloads a header-only file).
- The admin dashboard has no export button.

## 7. Swagger documentation

- Document `GET /api/customers/export` under the `Customers` tag with `bearerAuth`, the `200` response (binary `.xlsx`, `format: binary`) and the `401` response.
- Note that Swagger UI's "Try it out" offers the file as a download.

## 8. Configuration and deployment

- One new backend dependency for writing `.xlsx` files (recommended: `exceljs`). No new environment variables, no database change, no migration.
- No new frontend dependencies.
- CORS: the frontend reads the `Content-Disposition` header, so the backend must expose it (`Access-Control-Expose-Headers: Content-Disposition`). If this proves awkward the frontend falls back to building the file name itself.
- Vercel: the function's `includeFiles` and memory limits are enough for the expected data sizes; the export builds the file in memory.

## 9. Security requirements

- Only the logged-in user's rows are queried and exported (section 5).
- Cell values are never interpreted as formulas (section 4.1).
- The token is never placed in the URL or query string.
- Nothing about the export is logged except errors; customer data is not written to logs.

## 10. Acceptance criteria

1. `GET /api/customers/export` without a token returns `401`.
2. With a valid token it returns `200`, the `.xlsx` content type, and a `customers-YYYY-MM-DD.xlsx` attachment name.
3. The file opens as a valid workbook with a `Customers` sheet, a bold frozen header row (`Customer ID`, `Customer Name`, `Location`) and one row per customer.
4. User A's file contains exactly A's customers; user B's customers never appear in it, and vice versa. Customers with no owner (`sales_user_id` NULL) appear in nobody's file.
5. A user with no customers receives a valid file with only the header row.
6. A customer named `=1+1` is stored in the file as the literal text `=1+1`, not as a formula.
7. A customer added, edited or deleted before exporting is reflected in the file.
8. The UI button downloads the file, is disabled while exporting, shows an error toast on failure, and logs the user out on `401`.
9. Swagger UI documents the endpoint and shows the Authorize requirement.
10. The deployed Vercel backend passes criteria 1 to 7.

## 11. Decisions

1. **Columns:** Customer ID, Customer Name and Location (the owner id is not exported).
2. **Export library:** `exceljs`.
3. **Search filter:** not applied; the export always contains all of the user's customers.
