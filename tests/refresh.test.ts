import { describe, expect, it, vi } from "vitest";
// Capture both Axios clients so the test exercises the actual interceptors without network access.
vi.mock("axios", async () => {
  const actual = await vi.importActual<typeof import("axios")>("axios");
  const original = actual.default;
  return {
    ...actual,
    default: Object.assign(Object.create(original), {
      create: vi.fn((...args: Parameters<typeof original.create>) =>
        original.create(...args),
      ),
    }),
  };
});
import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
} from "axios";
import { api } from "../lib/api";
it("refreshes once for concurrent 401s, including a late old-token response", async () => {
  let refreshed = false;
  let refreshCount = 0;
  const adapter: AxiosAdapter = async (config) => {
    const response = (status: number, data: unknown): AxiosResponse => ({
      status,
      data,
      statusText: String(status),
      headers: {},
      config,
    });
    if (config.url === "/refresh") {
      refreshCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      refreshed = true;
      return response(200, { ok: true });
    }
    // Delay one initial response until AFTER refresh completed. Its old generation
    // should trigger a retry with current cookies, not another refresh request.
    const wasExpired = !refreshed;
    if (config.url === "/late" && wasExpired)
      await new Promise((resolve) => setTimeout(resolve, 25));
    if (wasExpired)
      throw new AxiosError(
        "Expired",
        "ERR_BAD_REQUEST",
        config,
        undefined,
        response(401, {}),
      );
    return response(200, { ok: true });
  };
  for (const result of vi.mocked(axios.create).mock.results)
    if (result.type === "return") result.value.defaults.adapter = adapter;
  const results = await Promise.all([
    api.get("/stats"),
    api.get("/products"),
    api.get("/late"),
  ]);
  expect(results.every((r) => r.status === 200)).toBe(true);
  expect(refreshCount).toBe(1);
});
