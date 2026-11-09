# Concerto Secure Dashboard — real API edition

A complete, commented Next.js + TypeScript + Tailwind application connected to:

https://testing.stage.concerto-media.com

This edition replaces the previous mock backend. Authentication, categories, statistics, chart and products now come from the actual `/api/v1` endpoints. No hardcoded product lists, category options, sales values or demo sessions are used at runtime.

## 1. Run

Install Node.js 20.9+ (Node 22/24 recommended). Extract the ZIP, open a terminal in `secure-dashboard`, and run:

```bash
npm ci
npm run dev
```

Open http://localhost:3000.

| Username | Password    | Role                           |
| -------- | ----------- | ------------------------------ |
| manager  | password123 | Statistics, chart and products |
| user     | password123 | Products only                  |

Both accounts were checked against the supplied staging backend. Credentials can be changed by its owner. No account is automatically signed in.

No environment setup is needed. Optionally copy `.env.example` to `.env.local` to override `BACKEND_URL`. The value is the origin WITHOUT `/api/v1` at the end. Never place credentials or tokens in a `NEXT_PUBLIC_` variable.

## 2. Commands

```bash
npm test           # Offline unit/API/interceptor tests; does not contact staging
npm run typecheck  # TypeScript checks
npm run build      # Production build
npm start          # Serve the production build
npm run smoke      # Optional LIVE checks; run npm run build first
```

The optional smoke check launches a temporary local production server on port 3101, logs into both staging test accounts and logs them out. It checks actual categories, stats, chart, product pages/filters, refresh and role permissions. Repeated runs count toward the backend's login rate limit. Set `SMOKE_PORT` if port 3101 is occupied.

Production cookies are Secure and deployments should use HTTPS. Use `npm run dev` for straightforward local development. This is a Next.js server app, not a static HTML export.

## 3. Architecture

The browser calls this app's `/api` routes. Those server routes call the real API and attach its Bearer token. This backend-for-frontend (BFF) keeps both tokens inside HttpOnly cookies and avoids browser-to-backend CORS configuration.

- Login sends `{ username, password }` to `/api/v1/auth/login`.
- The server stores `access_token` in a two-minute HttpOnly cookie, using the API's `expires_in`.
- `refresh_token` is an HttpOnly browser-session cookie; its actual validity remains controlled by the backend. No undocumented refresh lifetime is invented.
- Both cookies are SameSite=Lax and Secure in production, with `/api` scope.
- The browser receives only the normalized user, never the tokens.
- A data request returning 401 causes Axios to call the local refresh route, then retry the original request once.
- Concurrent failures share one refresh promise. A generation counter handles late 401s from requests sent before refresh completed.
- An invalid refresh clears cookies and cached client data, then redirects to login with the product filter URL preserved. A network outage shows a retryable error instead of pretending the session expired.
- Logout calls the backend to revoke tokens, clears cookies and client caches. If the access cookie has expired, logout can refresh and retry first.
- The API's login limit is authoritative. The app forwards HTTP 429 and `Retry-After`, disables submission and shows a countdown. Browser UI blocking is not treated as security enforcement.

## 4. Real endpoint mapping

| Local BFF                  | Actual backend                          |
| -------------------------- | --------------------------------------- |
| POST `/api/login`          | POST `/api/v1/auth/login`               |
| POST `/api/refresh`        | POST `/api/v1/auth/refresh`             |
| POST `/api/logout`         | POST `/api/v1/auth/logout`              |
| GET `/api/me`              | GET `/api/v1/auth/me`                   |
| GET `/api/categories`      | GET `/api/v1/categories`                |
| GET `/api/stats`           | GET `/api/v1/dashboard/stats`           |
| GET `/api/chart?year=2026` | GET `/api/v1/dashboard/chart?year=2026` |
| GET `/api/products`        | GET `/api/v1/products`                  |

There are eight actual backend endpoints. See `lib/types.ts` for response types and `lib/normalize.ts` for the mapping from snake_case API fields to frontend fields.

### Important statistics clarification

The actual API returns all four counters together: `today_sales`, `weekly_sales`, `monthly_sales`, `total_sales`. The app makes one statistics request and fills all four cards from it, instead of sending four identical requests.

The written brief mentions "This Year", while the supplied Figma and actual API say "Total sales". The app labels the fourth card "Total sales" and displays `total_sales`; it does not invent a yearly value. Confirm yearly semantics with the employer if they require that interpretation. The local statistics route supports optional `from`/`to` values and maps them to `date_from`/`date_to`; the default UI relies on the backend's own KPI time ranges. Product filters do not change the overview statistics.

## 5. Permissions and caching

The dashboard first obtains the current user from `/auth/me`. Regular users do not mount the manager overview or issue its queries. Before serving manager data, the server validates the current profile with the backend; the real data endpoints also enforce authorization. A client role, display label or URL never grants permission.

Statistics and chart queries have a two-minute `staleTime`, a longer inactive-cache lifetime and no interval polling, automatic retry, focus or reconnect refetch. The root QueryClient survives client navigation. Chart years have separate cache keys. "At most once per two minutes" does not mean "poll every two minutes": stale data loads on the next qualifying trigger.

A bounded server cache additionally coalesces requests and caches successful upstream statistics/chart results for two minutes per session and dataset. Role checks happen BEFORE cache reads, so reloading cannot expose cached manager data to another role. Failed loads are not cached and can be retried. This secondary cache is per Node process; shared Redis/locking would be needed to guarantee a global request budget across multiple server instances. Different years/date ranges are separate datasets. Profile checks are separate authentication calls, not statistics/chart refreshes.

## 6. Products, URLs and images

Example shareable link:

```text
http://localhost:3000/dashboard?search=Shoes&category=walk&from=2026-01-01&to=2026-12-31
```

- The URL is the source of truth. Opening it restores search, category and date filters. If login is required, the link survives the redirect.
- Search updates after 350 ms and replaces history; category/date changes push history entries. Back/forward updates the controls.
- Category names and slugs come from `/categories`. The dropdown is not hardcoded.
- Each filter chip can be removed, and Clear all resets everything.
- The BFF maps `from`/`to` to `date_from`/`date_to`. Category uses the API's documented `category` parameter with its slug/name/ID support.
- Infinite scrolling uses actual page numbers starting at 1 and `per_page=8`. The `meta.has_more_pages` and `meta.last_page` fields determine when loading ends. There is no fake cursor.
- Filters form part of the query key. A new filter dataset starts at page 1; revisiting a previously cached filter can reuse its cached pages.
- Empty results, invalid date ranges, initial failures, next-page failures and loading states are handled. Next-page failures require a retry instead of creating a retry loop.
- A keyboard-accessible Load more button supplements the automatic IntersectionObserver.
- Images use Next Image, lazy loading, responsive sizes and a reserved aspect ratio to prevent layout shift. Only the real API's Unsplash host is allowed. Missing/broken/unrecognized image URLs use a local placeholder.

The screenshot-derived shoe placeholder and approximated vector logo should be replaced with original Figma exports when available. Actual product images come from the API. Layout follows the supplied desktop screens and adapts to smaller widths; an interactive visual comparison against the Figma file has not been performed.

## 7. Where to read first

See `CODE_GUIDE.md` for a beginner-friendly explanation.

| File                           | Responsibility                                          |
| ------------------------------ | ------------------------------------------------------- |
| `lib/types.ts`                 | UI and real API data types                              |
| `lib/filters.ts`               | Filter serialization and date validation                |
| `lib/normalize.ts`             | API-to-UI field mapping and pagination                  |
| `lib/upstream.ts`              | Server-only Axios client, Bearer header and safe errors |
| `lib/token-cookies.ts`         | HttpOnly cookie creation/deletion                       |
| `lib/server-cache.ts`          | Coalesced two-minute server caching                     |
| `app/api/[...path]/route.ts`   | Eight local routes and actual API integration           |
| `lib/api.ts`                   | Browser Axios client and refresh interceptors           |
| `components/providers.tsx`     | Root QueryClient and session-expiry handler             |
| `app/login/page.tsx`           | Form state, login mutation, rate-limit UI               |
| `app/dashboard/page.tsx`       | User lookup, roles and logout                           |
| `components/overview.tsx`      | Four stats cards and yearly chart                       |
| `components/products.tsx`      | Dynamic categories, URL filters and infinite pages      |
| `components/product-image.tsx` | Optimized image and fallback                            |

## 8. Tests and review

The offline tests cover filter round trips, invalid dates, response normalization, fail-closed roles, image allowlisting, two-minute cache expiry, request coalescing, backend parameter mapping, server-side authorization, HttpOnly cookies, rate-limit forwarding, refresh handling and concurrent/late 401s.

For manual review: test both roles, a copied filtered URL, browser back/forward, filter removal, infinite scrolling, empty results and narrow viewports. To test real expiry, sign in, wait more than two minutes, then change a product filter. Network should show a refresh followed by a successful retry. The smoke script also tests refresh by removing only the local access cookie while retaining a valid backend refresh token.

No employer repository was supplied, so no remote commits or PR have been created. Import this code into the required repository, review and understand it, and open the requested PR. Do not claim a throughout-the-day commit history from a final ZIP import.

## Verification for this edition

Production build, TypeScript check and all 18 offline tests passed. The included live smoke script also passed against the actual staging backend for both roles: login, categories, statistics, chart, product filters, page-based pagination, refresh, logout and manager-only permissions. Interactive browser/pixel-level verification has not been performed.
