"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(() => {
    const expire = () => {
      client.clear();
      if (location.pathname !== "/login")
        location.replace(
          `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
        );
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
