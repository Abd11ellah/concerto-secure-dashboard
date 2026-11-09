import axios from "axios";
// Server-only module: do not import this from a component. No NEXT_PUBLIC_ variables or browser tokens.
const baseURL =
  (
    process.env.BACKEND_URL || "https://testing.stage.concerto-media.com"
  ).replace(/\/$/, "") + "/api/v1";
const backend = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { Accept: "application/json", "Content-Type": "application/json" },
  maxRedirects: 0,
});
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter?: string,
  ) {
    super(message);
  }
}
export async function upstream<T>(
  path: string,
  options: { method?: "GET" | "POST"; token?: string; body?: unknown } = {},
): Promise<T> {
  try {
    const result = await backend.request<T>({
      url: path,
      method: options.method ?? "GET",
      data: options.body,
      headers: options.token
        ? { Authorization: `Bearer ${options.token}` }
        : undefined,
    });
    return result.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      // Forward useful backend validation messages, but never reflect raw HTML, request configs or tokens.
      const message =
        typeof error.response?.data?.message === "string"
          ? error.response.data.message
          : status === 401
            ? "Your session expired or credentials are incorrect."
            : status === 403
              ? "You do not have permission to view this data."
              : status === 429
                ? "Too many attempts. Please wait before trying again."
                : status === 422
                  ? "Please check the submitted fields."
                  : "The backend is unavailable. Please try again.";
      const retryAfter = error.response?.headers["retry-after"];
      throw new ApiError(
        status && status >= 400 && status <= 599 ? status : 502,
        message,
        retryAfter ? String(retryAfter) : undefined,
      );
    }
    throw new ApiError(502, "The backend is unavailable. Please try again.");
  }
}
