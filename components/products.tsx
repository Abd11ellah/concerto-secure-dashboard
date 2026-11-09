"use client";
import { ProductImage } from "@/components/product-image";
import { Search, X } from "lucide-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import {
  EMPTY_FILTERS,
  filterError,
  readFilters,
  serializeFilters,
} from "@/lib/filters";
import type { Category, Filters, ProductPage } from "@/lib/types";
export function Products({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterString = serializeFilters(
    readFilters(new URLSearchParams(searchParams.toString())),
  ).toString();
  const filters = readFilters(new URLSearchParams(filterString));
  const [search, setSearch] = useState(filters.search);
  const sentinel = useRef<HTMLDivElement>(null);
  const update = useCallback(
    (patch: Partial<Filters>, replace = false) => {
      const current = readFilters(new URLSearchParams(filterString));
      const next = serializeFilters({ ...current, ...patch }).toString();
      const href = `${pathname}${next ? `?${next}` : ""}`;
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [filterString, pathname, router],
  );
  // Categories are data, not constants: read the backend's current names and slugs.
  const categories = useQuery({
    queryKey: ["categories", userId],
    queryFn: async () => (await api.get<Category[]>("/categories")).data,
    staleTime: 5 * 60_000,
  });
  const categoryName =
    categories.data?.find((c) =>
      [c.slug, c.name, String(c.id)].includes(filters.category),
    )?.name ?? filters.category;
  // Back/forward and copied URLs update the input too.
  useEffect(() => {
    setSearch(filters.search);
  }, [filters.search]);
  useEffect(() => {
    if (search === filters.search) return;
    const timer = setTimeout(() => update({ search }, true), 350);
    return () => clearTimeout(timer);
  }, [search, filters.search, update]);
  const validation = filterError(filters);
  const query = useInfiniteQuery({
    // A new filter key creates a separate first page instead of appending stale results.
    queryKey: ["products", userId, filterString],
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }) =>
      (
        await api.get<ProductPage>(`/products?${filterString}`, {
          params: { page: pageParam },
          signal,
        })
      ).data,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: !validation,
    staleTime: 30_000,
    retry: false,
  });
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isFetching,
  } = query;
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage || isFetchNextPageError || validation) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetching)
          void fetchNextPage({ cancelRefetch: false });
      },
      { rootMargin: "250px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchNextPageError,
    validation,
  ]);
  const items = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  const chips = [
    filters.search && {
      label: `Search: ${filters.search}`,
      clear: () => {
        setSearch("");
        update({ search: "" });
      },
    },
    filters.category && {
      label: `Category: ${categoryName}`,
      clear: () => update({ category: "" }),
    },
    (filters.from || filters.to) && {
      label: `Date: ${filters.from || "Any"} – ${filters.to || "Any"}`,
      clear: () => update({ from: "", to: "" }),
    },
  ].filter(Boolean) as { label: string; clear: () => void }[];
  return (
    <section className="products-section" aria-label="Products">
      <div className="filter-grid">
        <label className="search-control">
          <Search size={17} />
          <span className="sr-only">Search products</span>
          <input
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            value={filters.category}
            onChange={(e) => update({ category: e.target.value })}
          >
            <option value="">All Categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
            {filters.category &&
              !categories.data?.some((c) => c.slug === filters.category) && (
                <option value={filters.category}>{categoryName}</option>
              )}
          </select>
        </label>
        <label>
          <span className="sr-only">From date</span>
          <input
            aria-label="From date"
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
        </label>
        <label>
          <span className="sr-only">To date</span>
          <input
            aria-label="To date"
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </label>
      </div>
      {categories.isError && (
        <p role="alert" className="field-error">
          Categories could not load.{" "}
          <button onClick={() => void categories.refetch()}>Retry</button>
        </p>
      )}
      {chips.length > 0 && (
        <div className="chips">
          {chips.map((chip) => (
            <button key={chip.label} className="chip" onClick={chip.clear}>
              {chip.label}
              <X size={15} />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            className="clear"
            onClick={() => {
              setSearch("");
              update(EMPTY_FILTERS);
            }}
          >
            Clear all
          </button>
        </div>
      )}
      {validation && (
        <p role="alert" className="notice">
          {validation}
        </p>
      )}
      {!validation && query.isPending && (
        <div className="product-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton product-placeholder" />
          ))}
        </div>
      )}
      {!validation && query.isError && !items.length && (
        <p role="alert" className="notice">
          {errorMessage(query.error)}{" "}
          <button onClick={() => void query.refetch()}>Try again</button>
        </p>
      )}
      {!validation && query.isSuccess && !items.length && (
        <p className="notice">No products match these filters.</p>
      )}
      {!validation && (
        <div className="product-grid">
          {items.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-image">
                <ProductImage src={product.image} name={product.name} />
              </div>
              <div className="product-info">
                <p>{product.category}</p>
                <h2>{product.name}</h2>
                <strong>{product.price}$</strong>
              </div>
            </article>
          ))}
        </div>
      )}
      <div ref={sentinel} className="load-more" aria-live="polite">
        {isFetchingNextPage ? (
          "Loading more products…"
        ) : !validation && hasNextPage ? (
          <button
            disabled={isFetching}
            onClick={() => void fetchNextPage({ cancelRefetch: false })}
          >
            {isFetchNextPageError ? "Could not load more. Retry" : "Load more"}
          </button>
        ) : items.length > 0 && !validation ? (
          "You have seen all products."
        ) : (
          ""
        )}
      </div>
    </section>
  );
}
