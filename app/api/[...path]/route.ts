import { NextRequest, NextResponse } from "next/server";
import { ApiError, upstream } from "@/lib/upstream";
import { cached, cacheScope, clearSessionCache } from "@/lib/server-cache";
import { clearTokenCookies, setTokenCookies } from "@/lib/token-cookies";
import { normalizeProducts, normalizeUser } from "@/lib/normalize";
import { filterError, readFilters } from "@/lib/filters";
import type {
  ApiProducts,
  ApiUser,
  Category,
  Envelope,
  Stats,
  Tokens,
} from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const contextPath = async (context: { params: Promise<{ path: string[] }> }) =>
  (await context.params).path.join("/");
function access(req: NextRequest) {
  const token = req.cookies.get("dashboard_access")?.value;
  if (!token) throw new ApiError(401, "Authentication required.");
  return token;
}
function failure(error: unknown) {
  const e =
    error instanceof ApiError
      ? error
      : new ApiError(502, "Unable to complete the request. Please try again.");
  const response = json({ message: e.message }, e.status);
  if (e.retryAfter) response.headers.set("Retry-After", e.retryAfter);
  return response;
}
// A refresh request uses its own client on the frontend, so it cannot recursively refresh itself.
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = await contextPath(context);
  try {
    // HttpOnly + SameSite cookies protect tokens; an Origin check protects cookie-authenticated mutations.
    if (
      req.headers.get("origin") &&
      req.headers.get("origin") !== req.nextUrl.origin
    )
      throw new ApiError(403, "Origin not allowed.");
    if (path === "login") {
      const body = await req.json().catch(() => null);
      if (
        typeof body?.username !== "string" ||
        !body.username.trim() ||
        typeof body?.password !== "string" ||
        !body.password
      )
        throw new ApiError(422, "Username and password are required.");
      // The actual backend enforces five attempts/minute. Preserve its 429 and Retry-After.
      const result = await upstream<Envelope<Tokens & { user: ApiUser }>>(
        "/auth/login",
        {
          method: "POST",
          body: { username: body.username.trim(), password: body.password },
        },
      );
      return setTokenCookies(
        json({ user: normalizeUser(result.data.user) }),
        result.data,
      );
    }
    if (path === "refresh") {
      const refresh = req.cookies.get("dashboard_refresh")?.value;
      if (!refresh)
        throw new ApiError(401, "Your session expired. Please sign in again.");
      const result = await upstream<Envelope<Tokens>>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refresh },
      });
      return setTokenCookies(json({ ok: true }), result.data);
    }
    if (path === "logout") {
      const refresh = req.cookies.get("dashboard_refresh")?.value;
      // Already signed out is an idempotent success. An expired access cookie with
      // a remaining refresh cookie causes Axios to refresh once, then retry logout.
      if (refresh || req.cookies.get("dashboard_access"))
        await upstream("/auth/logout", { method: "POST", token: access(req) });
      if (refresh) clearSessionCache(cacheScope(refresh));
      return clearTokenCookies(json({ ok: true }));
    }
    return json({ message: "Not found." }, 404);
  } catch (error) {
    const response = failure(error);
    // Ordinary 401s must KEEP refresh cookies so the interceptor can recover.
    return path === "refresh" && response.status === 401
      ? clearTokenCookies(response)
      : response;
  }
}
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = await contextPath(context);
    if (!["me", "categories", "stats", "chart", "products"].includes(path))
      return json({ message: "Not found." }, 404);
    const token = access(req);
    if (path === "me") {
      const result = await upstream<Envelope<ApiUser>>("/auth/me", { token });
      return json({ user: normalizeUser(result.data) });
    }
    if (path === "categories") {
      const result = await upstream<Envelope<Category[]>>("/categories", {
        token,
      });
      return json(result.data);
    }
    if (path === "stats" || path === "chart") {
      // Authorize with the actual backend BEFORE serving any server-cached manager data.
      // A role from a URL, client state or unsigned cookie is never trusted.
      const profile = await upstream<Envelope<ApiUser>>("/auth/me", { token });
      if (profile.data.role !== "manager")
        throw new ApiError(403, "Manager access required.");
      const refresh = req.cookies.get("dashboard_refresh")?.value;
      if (!refresh)
        throw new ApiError(401, "Session refresh token is missing.");
      const scope = cacheScope(refresh);
      if (path === "stats") {
        const filters = readFilters(req.nextUrl.searchParams);
        const error = filterError(filters);
        if (error) throw new ApiError(422, error);
        const params = new URLSearchParams();
        if (filters.from) params.set("date_from", filters.from);
        if (filters.to) params.set("date_to", filters.to);
        // The live API returns ALL FOUR values together. Do not issue four identical calls.
        const data = await cached(
          `${scope}:stats:${params}`,
          async () =>
            (
              await upstream<Envelope<Stats>>(`/dashboard/stats?${params}`, {
                token,
              })
            ).data,
        );
        return json(data);
      }
      const year = Number(req.nextUrl.searchParams.get("year"));
      if (!Number.isInteger(year) || year < 2000 || year > 2100)
        throw new ApiError(422, "Invalid chart year.");
      const data = await cached(`${scope}:chart:${year}`, async () => {
        const result = await upstream<
          Envelope<{ month: string; sales: number }[]>
        >(`/dashboard/chart?year=${year}`, { token });
        return result.data.map((p) => ({ month: p.month, value: p.sales }));
      });
      return json(data);
    }
    // Translate readable shareable URL filters into the actual API query names.
    const filters = readFilters(req.nextUrl.searchParams);
    const error = filterError(filters);
    if (error) throw new ApiError(422, error);
    const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
    if (!Number.isInteger(page) || page < 1)
      throw new ApiError(422, "Invalid page number.");
    const params = new URLSearchParams({ page: String(page), per_page: "8" });
    if (filters.search) params.set("search", filters.search);
    if (filters.category) params.set("category", filters.category);
    if (filters.from) params.set("date_from", filters.from);
    if (filters.to) params.set("date_to", filters.to);
    return json(
      normalizeProducts(
        await upstream<ApiProducts>(`/products?${params}`, { token }),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
