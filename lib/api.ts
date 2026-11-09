"use client";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
export const api = axios.create({ baseURL: "/api", timeout: 45_000 });
// Separate client prevents the refresh request from intercepting its own failure.
const sessionApi = axios.create({ baseURL: "/api", timeout: 45_000 });
let refreshing: Promise<unknown> | null = null;
let generation = 0;
type Config = InternalAxiosRequestConfig & {
  retried?: boolean;
  authGeneration?: number;
};
api.interceptors.request.use((config) => {
  (config as Config).authGeneration = generation;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as Config | undefined;
    if (
      !config ||
      error.response?.status !== 401 ||
      config.retried ||
      config.url === "/login"
    )
      throw error;
    config.retried = true;
    try {
      // A late 401 may belong to a request sent BEFORE a refresh already completed.
      // In that case retry with current cookies instead of refreshing a second time.
      if (config.authGeneration === generation) {
        if (!refreshing)
          refreshing = sessionApi
            .post("/refresh")
            .then((result) => {
              generation++;
              return result;
            })
            .finally(() => {
              refreshing = null;
            });
        await refreshing;
      }
      return await api(config);
    } catch (refreshError) {
      if (
        axios.isAxiosError(refreshError) &&
        refreshError.response?.status === 401 &&
        typeof window !== "undefined"
      )
        window.dispatchEvent(new Event("session-expired"));
      throw refreshError;
    }
  },
);
export function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? error.response?.data?.message || "Unable to connect. Please try again."
    : "Something went wrong. Please try again.";
}
