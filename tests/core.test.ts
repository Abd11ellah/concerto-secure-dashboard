import { describe, expect, it, vi, afterEach } from "vitest";
import { filterError, readFilters, serializeFilters } from "../lib/filters";
import { cached } from "../lib/server-cache";
import {
  normalizeProducts,
  normalizeUser,
  productImage,
} from "../lib/normalize";
import type { ApiProducts } from "../lib/types";
afterEach(() => vi.useRealTimers());
describe("shareable filters", () => {
  it("round-trips spaces and special characters", () => {
    const filters = {
      search: "Shoes & bags",
      category: "walk",
      from: "2026-01-01",
      to: "2026-12-31",
    };
    expect(readFilters(serializeFilters(filters))).toEqual(filters);
  });
  it("rejects impossible and reversed dates", () => {
    expect(
      filterError({ search: "", category: "", from: "2026-02-30", to: "" }),
    ).toBeTruthy();
    expect(
      filterError({
        search: "",
        category: "",
        from: "2026-12-31",
        to: "2026-01-01",
      }),
    ).toBeTruthy();
  });
});
describe("real API normalization", () => {
  it("never elevates an unknown role", () => {
    expect(
      normalizeUser({
        id: 1,
        name: "A",
        username: "a",
        email: "a@test",
        role: "admin",
      }).role,
    ).toBe("user");
  });
  it("maps snake_case products and page-based pagination", () => {
    const response: ApiProducts = {
      status: "success",
      data: [
        {
          id: 1,
          name: "Shoe",
          price: "10",
          image_url: null,
          category_name: "Walk",
          created_at: "2026-01-01",
        },
      ],
      meta: {
        current_page: 1,
        last_page: 2,
        per_page: 8,
        total: 9,
        has_more_pages: true,
      },
    };
    expect(normalizeProducts(response)).toMatchObject({
      items: [{ price: 10, category: "Walk", image: "/shoes.webp" }],
      nextPage: 2,
      total: 9,
    });
    response.meta.current_page = 2;
    response.meta.has_more_pages = false;
    expect(normalizeProducts(response).nextPage).toBeNull();
  });
  it("only allows configured remote image hosts", () => {
    expect(productImage("http://127.0.0.1/private")).toBe("/shoes.webp");
    expect(productImage("https://images.unsplash.com.evil.test/a")).toBe(
      "/shoes.webp",
    );
    expect(productImage("https://images.unsplash.com/photo-a")).toContain(
      "https://images.unsplash.com/",
    );
  });
});
describe("two-minute server cache", () => {
  it("coalesces simultaneous calls and expires after two minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const load = vi.fn(async () => 7);
    expect(
      await Promise.all([cached("test-ttl", load), cached("test-ttl", load)]),
    ).toEqual([7, 7]);
    vi.setSystemTime(120999);
    await cached("test-ttl", load);
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(121000);
    await cached("test-ttl", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not poison the cache with failed requests", async () => {
    await expect(
      cached("failed-test", async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    await expect(cached("failed-test", async () => 3)).resolves.toBe(3);
  });
});
