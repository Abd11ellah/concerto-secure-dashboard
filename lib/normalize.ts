import type { ApiProducts, ApiUser, ProductPage, User } from "./types";
// Fail closed: an unexpected role must never acquire manager privileges.
export function normalizeUser(user: ApiUser): User {
  return {
    id: String(user.id),
    name: user.name,
    role: user.role === "manager" ? "manager" : "user",
  };
}
export function normalizeProducts(response: ApiProducts): ProductPage {
  return {
    items: response.data.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category_name,
      price: Number(p.price),
      image: productImage(p.image_url),
      createdAt: p.created_at,
    })),
    nextPage:
      response.meta.has_more_pages &&
      response.meta.current_page < response.meta.last_page
        ? response.meta.current_page + 1
        : null,
    total: response.meta.total,
  };
}
export function productImage(url: string | null) {
  // Match Next Image's allowlist. Never turn the image optimizer into an arbitrary URL proxy.
  try {
    const parsed = new URL(url ?? "");
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "images.unsplash.com"
    )
      return parsed.toString();
  } catch {
    /* use local placeholder */
  }
  return "/shoes.webp";
}
