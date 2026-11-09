"use client";
import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import dynamic from "next/dynamic";
import { api, errorMessage } from "@/lib/api";
import { Logo } from "@/components/logo";
import { Products } from "@/components/products";
import type { User } from "@/lib/types";
// Recharts is only loaded on the client when a manager needs the overview.
const Overview = dynamic(() => import("@/components/overview"), {
  ssr: false,
  loading: () => <div className="skeleton overview-placeholder" />,
});
function DashboardContent() {
  const router = useRouter();
  const client = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<{ user: User }>("/me")).data.user,
    staleTime: 0,
    retry: false,
  });
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await api.post("/logout");
      await client.cancelQueries();
      client.clear();
      router.replace("/login");
    } catch (error) {
      setLogoutError(errorMessage(error));
      setLoggingOut(false);
    }
  }
  if (me.isPending)
    return <p className="page-message">Checking your session…</p>;
  if (me.isError)
    return (
      <div className="page-message" role="alert">
        {errorMessage(me.error)}{" "}
        <button onClick={() => void me.refetch()}>Try again</button>
      </div>
    );
  const user = me.data;
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Logo />
          <span>Welcome {user.name}</span>
          <div className="header-actions">
            <span>{user.role === "manager" ? "Admin" : "User"}</span>
            <button
              aria-label="Sign out"
              title="Sign out"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>
      <main className="dashboard">
        {logoutError && (
          <p role="alert" className="notice">
            {logoutError}
          </p>
        )}
        {/* Conditional mounting means users never issue manager data requests. Server also checks roles. */}
        {user.role === "manager" && <Overview userId={user.id} />}
        <Products userId={user.id} />
      </main>
    </>
  );
}
export default function Dashboard() {
  return (
    <Suspense fallback={<p className="page-message">Loading dashboard…</p>}>
      <DashboardContent />
    </Suspense>
  );
}
