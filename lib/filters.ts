import type { Filters } from "./types";
export const EMPTY_FILTERS: Filters = {
  search: "",
  category: "",
  from: "",
  to: "",
};
// Keep one canonical filter representation for links, query keys and API requests.
export function readFilters(params: URLSearchParams): Filters {
  return {
    search: (params.get("search") ?? "").slice(0, 100),
    category: params.get("category") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
}
export function serializeFilters(filters: Filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return params;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function filterError(filters: Filters) {
  if (
    (filters.from && !validDate(filters.from)) ||
    (filters.to && !validDate(filters.to))
  )
    return "Enter valid dates.";
  if (filters.from && filters.to && filters.from > filters.to)
    return "From must be on or before To.";
  return "";
}
