// Optional LIVE integration check. Run `npm run build` first, then `npm run smoke`.
// This signs into the supplied staging accounts and signs out again. It never logs tokens.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const port = Number(process.env.SMOKE_PORT || 3101);
const base = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    String(port),
    "--hostname",
    "127.0.0.1",
  ],
  { stdio: ["ignore", "ignore", "pipe"], env: process.env },
);
let serverError = "";
server.stderr.on("data", (chunk) => {
  serverError += chunk.toString();
});
const cookies = new Map();
async function call(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(50_000),
  });
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const at = pair.indexOf("=");
    const key = pair.slice(0, at),
      value = pair.slice(at + 1);
    if (value) cookies.set(key, value);
    else cookies.delete(key);
  }
  const data = await response.json();
  return { status: response.status, data };
}
function success(result, label) {
  assert.equal(
    result.status,
    200,
    `${label}: HTTP ${result.status}; ${result.data?.message ?? ""}`,
  );
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + "/login");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* wait for local server */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Local server did not start: ${serverError}`);
  assert.equal((await call("/api/products")).status, 401);
  const manager = await call("/api/login", {
    username: "manager",
    password: "password123",
  });
  success(manager, "Manager login");
  assert.equal(manager.data.user.role, "manager");
  assert.equal(manager.data.access_token, undefined);
  success(await call("/api/me"), "Profile");
  const categories = await call("/api/categories");
  success(categories, "Categories");
  assert.ok(categories.data.length);
  const stats = await call("/api/stats");
  success(stats, "Statistics");
  assert.equal(typeof stats.data.today_sales, "number");
  const chart = await call("/api/chart?year=2026");
  success(chart, "Chart");
  assert.equal(chart.data.length, 12);
  const first = await call("/api/products?page=1");
  success(first, "Products page one");
  assert.equal(first.data.nextPage, 2);
  const second = await call("/api/products?page=2");
  success(second, "Products page two");
  assert.notEqual(first.data.items[0].id, second.data.items[0].id);
  const filtered = await call(
    "/api/products?category=walk&search=Shoes&from=2026-01-01&to=2026-12-31&page=1",
  );
  success(filtered, "Product filters");
  assert.ok(filtered.data.items.length);
  assert.ok(filtered.data.items.every((p) => p.category === "Walk"));
  // Simulate the browser dropping an expired access cookie; retain the real refresh cookie.
  cookies.delete("dashboard_access");
  assert.equal((await call("/api/me")).status, 401);
  success(await call("/api/refresh", {}), "Live token refresh");
  success(await call("/api/me"), "Profile after refresh");
  success(await call("/api/logout", {}), "Manager logout");
  assert.equal((await call("/api/me")).status, 401);
  const user = await call("/api/login", {
    username: "user",
    password: "password123",
  });
  success(user, "User login");
  assert.equal(user.data.user.role, "user");
  assert.equal((await call("/api/stats")).status, 403);
  assert.equal((await call("/api/chart?year=2026")).status, 403);
  success(await call("/api/products"), "User products");
  success(await call("/api/logout", {}), "User logout");
  console.log(
    "PASS: live login (both roles), categories, statistics, chart, filters, pagination, refresh, logout and permissions.",
  );
} finally {
  server.kill();
}
