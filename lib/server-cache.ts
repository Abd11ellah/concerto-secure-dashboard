import { createHash } from "node:crypto";
type Entry = { expires: number; value: unknown };
const state = globalThis as unknown as {
  dashboardCache?: Map<string, Entry>;
  dashboardPending?: Map<string, Promise<unknown>>;
};
const values = (state.dashboardCache ??= new Map<string, Entry>());
const pending = (state.dashboardPending ??= new Map<
  string,
  Promise<unknown>
>());
export const cacheScope = (refresh: string) =>
  createHash("sha256").update(refresh).digest("hex");
// Single-flight + TTL: navigation/reloads and simultaneous requests reuse one computation.
// The scope is a hash of the HttpOnly refresh token; data never crosses login sessions.
// This cache is per Node process. Use Redis/shared locking for a multi-instance deployment.
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  now = Date.now(),
): Promise<T> {
  const entry = values.get(key);
  if (entry && entry.expires > now) return entry.value as T;
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = load()
    .then((value) => {
      // Bound memory. Expired entries are cheap to discard before evicting the oldest.
      for (const [k, v] of values)
        if (v.expires <= Date.now()) values.delete(k);
      if (values.size >= 128) values.delete(values.keys().next().value!);
      values.set(key, { value, expires: Date.now() + 120_000 });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
export function clearSessionCache(scope: string) {
  for (const key of values.keys())
    if (key.startsWith(scope + ":")) values.delete(key);
}
