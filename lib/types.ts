// UI types deliberately differ from the API's snake_case fields.
// lib/normalize.ts is the only place that translates between the two.
export type Role = "manager" | "user";
export type User = { id: string; name: string; role: Role };
export type Filters = {
  search: string;
  category: string;
  from: string;
  to: string;
};
export type Category = { id: number; name: string; slug: string };
export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  image: string;
  createdAt: string;
};
export type ProductPage = {
  items: Product[];
  nextPage: number | null;
  total: number;
};
export type ChartPoint = { month: string; value: number };
export type Stats = {
  today_sales: number;
  weekly_sales: number;
  monthly_sales: number;
  total_sales: number;
};
export type ApiUser = {
  id: number | string;
  name: string;
  username: string;
  email: string;
  role: string;
};
export type ApiProduct = {
  id: number;
  name: string;
  price: number | string;
  image_url: string | null;
  category_name: string;
  created_at: string;
};
export type ApiProducts = {
  status: string;
  data: ApiProduct[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more_pages: boolean;
  };
};
export type Envelope<T> = { status: string; data: T };
export type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};
