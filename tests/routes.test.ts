import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("../lib/upstream", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/upstream")>("../lib/upstream");
  return { ...actual, upstream: vi.fn() };
});
import { GET, POST } from "../app/api/[...path]/route";
import { upstream, ApiError } from "../lib/upstream";
const mock = vi.mocked(upstream);
const context = (path: string) => ({
  params: Promise.resolve({ path: [path] }),
});
const cookie = "dashboard_access=access-test; dashboard_refresh=refresh-test";
function request(path: string, cookies = cookie) {
  return new NextRequest(`http://localhost:3000/api/${path}`, {
    headers: { cookie: cookies },
  });
}
const profile = (role = "manager") => ({
  status: "success",
  data: { id: 1, name: "A", username: "manager", email: "a@test", role },
});
beforeEach(() => {
  mock.mockReset();
});
describe("real API BFF", () => {
  it("blocks anonymous products requests before contacting the backend", async () => {
    expect(
      (await GET(request("products", ""), context("products"))).status,
    ).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
  it("denies regular users before accessing manager data or cache", async () => {
    mock.mockResolvedValue(profile("user"));
    expect(
      (await GET(request("chart?year=2026"), context("chart"))).status,
    ).toBe(403);
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("translates filters and page number to the documented backend parameters", async () => {
    mock.mockResolvedValue({
      status: "success",
      data: [],
      meta: {
        current_page: 2,
        last_page: 2,
        per_page: 8,
        total: 8,
        has_more_pages: false,
      },
    });
    const result = await GET(
      request(
        "products?category=walk&search=Shoes&from=2026-01-01&to=2026-12-31&page=2",
      ),
      context("products"),
    );
    expect(result.status).toBe(200);
    expect(mock).toHaveBeenCalledWith(
      "/products?page=2&per_page=8&search=Shoes&category=walk&date_from=2026-01-01&date_to=2026-12-31",
      { token: "access-test" },
    );
    expect((await result.json()).nextPage).toBeNull();
  });
  it("gets all four statistics with one backend call and caches the result", async () => {
    const stats = {
      today_sales: 50,
      weekly_sales: 120,
      monthly_sales: 840,
      total_sales: 4000,
    };
    mock.mockImplementation(async (path) =>
      path === "/auth/me" ? profile() : { status: "success", data: stats },
    );
    const first = await GET(request("stats"), context("stats"));
    const second = await GET(request("stats"), context("stats"));
    expect(await first.json()).toEqual(stats);
    expect(await second.json()).toEqual(stats);
    expect(
      mock.mock.calls.filter(([path]) => path.startsWith("/dashboard/stats")),
    ).toHaveLength(1);
    expect(
      mock.mock.calls.filter(([path]) => path === "/auth/me"),
    ).toHaveLength(2);
  });
  it("stores login tokens in HttpOnly cookies and never returns them to JS", async () => {
    mock.mockResolvedValue({
      status: "success",
      data: {
        access_token: "secret-access",
        refresh_token: "secret-refresh",
        expires_in: 120,
        token_type: "Bearer",
        user: profile().data,
      },
    });
    const req = new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "manager", password: "password123" }),
    });
    const result = await POST(req, context("login"));
    expect(result.cookies.get("dashboard_access")?.httpOnly).toBe(true);
    expect(result.cookies.get("dashboard_refresh")?.httpOnly).toBe(true);
    expect(await result.json()).toEqual({
      user: { id: "1", name: "A", role: "manager" },
    });
  });
  it("forwards the backend rate limit and Retry-After header", async () => {
    mock.mockRejectedValue(new ApiError(429, "Too many attempts.", "42"));
    const req = new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      body: JSON.stringify({ username: "x", password: "wrong" }),
    });
    const result = await POST(req, context("login"));
    expect(result.status).toBe(429);
    expect(result.headers.get("Retry-After")).toBe("42");
  });
  it("sends refresh_token in the body and sets the renewed access cookie", async () => {
    mock.mockResolvedValue({
      status: "success",
      data: {
        access_token: "renewed-access",
        expires_in: 120,
        token_type: "Bearer",
      },
    });
    const req = new NextRequest("http://localhost:3000/api/refresh", {
      method: "POST",
      headers: { cookie },
    });
    const result = await POST(req, context("refresh"));
    expect(mock).toHaveBeenCalledWith("/auth/refresh", {
      method: "POST",
      body: { refresh_token: "refresh-test" },
    });
    expect(result.cookies.get("dashboard_access")?.value).toBe(
      "renewed-access",
    );
    expect(result.cookies.get("dashboard_refresh")).toBeUndefined();
  });
  it("clears cookies when refresh is rejected", async () => {
    mock.mockRejectedValue(new ApiError(401, "Expired."));
    const result = await POST(
      new NextRequest("http://localhost:3000/api/refresh", {
        method: "POST",
        headers: { cookie },
      }),
      context("refresh"),
    );
    expect(result.status).toBe(401);
    expect(result.cookies.get("dashboard_refresh")?.maxAge).toBe(0);
  });
  it("keeps cookies on ordinary 401s so refresh remains possible", async () => {
    mock.mockRejectedValue(new ApiError(401, "Expired."));
    const result = await GET(request("me"), context("me"));
    expect(result.status).toBe(401);
    expect(result.headers.has("set-cookie")).toBe(false);
  });
  it("rejects cross-origin mutations", async () => {
    const req = new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      headers: { origin: "https://other.example" },
    });
    expect((await POST(req, context("login"))).status).toBe(403);
    expect(mock).not.toHaveBeenCalled();
  });
});
