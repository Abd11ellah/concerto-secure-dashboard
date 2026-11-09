import { NextResponse } from "next/server";
import type { Tokens } from "./types";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api",
};
export function setTokenCookies(response: NextResponse, tokens: Tokens) {
  response.cookies.set("dashboard_access", tokens.access_token, {
    ...cookieOptions,
    maxAge: Math.max(1, tokens.expires_in),
  });
  if (tokens.refresh_token) {
    // No maxAge: refresh is a browser-session cookie. Backend remains authoritative about expiry.
    // If refresh rotates in a future API revision, persist the replacement automatically.
    response.cookies.set(
      "dashboard_refresh",
      tokens.refresh_token,
      cookieOptions,
    );
  }
  return response;
}
export function clearTokenCookies(response: NextResponse) {
  for (const name of ["dashboard_access", "dashboard_refresh"])
    response.cookies.set(name, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
