"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import axios from "axios";
import { api, errorMessage } from "@/lib/api";
import { Logo } from "@/components/logo";
import type { User } from "@/lib/types";
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    setBlockedUntil(Number(sessionStorage.getItem("login-blocked-until")) || 0);
  }, []);
  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [blockedUntil]);
  const login = useMutation({
    mutationFn: async () =>
      (await api.post<{ user: User }>("/login", { username, password })).data,
    onSuccess: ({ user }) => {
      sessionStorage.removeItem("login-blocked-until");
      client.clear();
      client.setQueryData(["me"], user);
      // Reject absolute and protocol-relative redirects supplied by untrusted URLs.
      const next = params.get("next");
      router.replace(
        next && /^\/dashboard(?:\?|$)/.test(next) ? next : "/dashboard",
      );
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const seconds = Math.max(
          1,
          Number(error.response.headers["retry-after"]) || 60,
        );
        const until = Date.now() + seconds * 1000;
        sessionStorage.setItem("login-blocked-until", String(until));
        setBlockedUntil(until);
      }
    },
  });
  return (
    <main className="login-page">
      <section className="login-card">
        <Logo />
        <h1>Log in to your account</h1>
        <p className="welcome">Welcome back! Please enter your details.</p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (username.trim() && password && !remaining && !login.isPending)
              login.mutate();
          }}
        >
          <label htmlFor="username">Name</label>
          <input
            id="username"
            autoComplete="username"
            placeholder="Enter your Name"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              login.reset();
            }}
            aria-invalid={submitted && !username.trim()}
            aria-describedby={
              submitted && !username.trim() ? "username-error" : undefined
            }
          />
          {submitted && !username.trim() && (
            <p id="username-error" className="field-error">
              Username is required.
            </p>
          )}
          <label htmlFor="password">Password</label>
          <div className="password-wrap">
            <input
              id="password"
              autoComplete="current-password"
              placeholder="Enter your Password"
              type={visible ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                login.reset();
              }}
              aria-invalid={submitted && !password}
              aria-describedby={
                submitted && !password ? "password-error" : undefined
              }
            />
            <button
              type="button"
              className="eye"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
          </div>
          {submitted && !password && (
            <p id="password-error" className="field-error">
              Password is required.
            </p>
          )}
          {login.isError && (
            <p role="alert" className="field-error">
              {errorMessage(login.error)}
            </p>
          )}
          <button
            className="primary"
            disabled={login.isPending || remaining > 0}
          >
            {remaining
              ? `Try again in ${remaining}s`
              : login.isPending
                ? "Signing in…"
                : "Sign in"}
          </button>
        </form>
      </section>
      <footer>
        All Rights Reserved © <span>Concerto Media L.L.C</span>
      </footer>
    </main>
  );
}
export default function Login() {
  return (
    <Suspense fallback={<p className="page-message">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
