"use client";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import {
  Area,
  LabelList,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import type { ChartPoint, Stats } from "@/lib/types";
// Fresh for two minutes. gcTime is longer so unmounted widgets retain their data.
// There is no polling or automatic retry; a remount after staleness can fetch again.
const cachePolicy = {
  staleTime: 120_000,
  gcTime: 30 * 60_000,
  retry: false as const,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
};
// All cards share ONE response because that is how the real backend is designed.
const statCards: { key: keyof Stats; label: string }[] = [
  { key: "today_sales", label: "Total sales today" },
  { key: "weekly_sales", label: "Total sales this week" },
  { key: "monthly_sales", label: "Total sales this month" },
  { key: "total_sales", label: "Total sales" },
];
export default function Overview({ userId }: { userId: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const stats = useQuery({
    queryKey: ["stats", userId],
    queryFn: async () => (await api.get<Stats>("/stats")).data,
    ...cachePolicy,
  });
  const chart = useQuery({
    queryKey: ["chart", userId, year],
    queryFn: async () =>
      (await api.get<ChartPoint[]>("/chart", { params: { year } })).data,
    ...cachePolicy,
  });
  return (
    <section aria-label="Manager overview">
      <div className="stats-grid">
        {statCards.map((card) => (
          <article className="stat" key={card.key}>
            <div>
              <p>{card.label}</p>
              {stats.isPending ? (
                <span className="skeleton stat-skeleton" />
              ) : stats.isError ? (
                <span className="field-error">Unavailable</span>
              ) : (
                <strong>{stats.data[card.key]}</strong>
              )}
            </div>
            <span className="stat-icon">
              <Package size={21} />
            </span>
          </article>
        ))}
      </div>
      {stats.isError && (
        <p role="alert" className="field-error">
          {errorMessage(stats.error)}{" "}
          <button onClick={() => void stats.refetch()}>Try again</button>
        </p>
      )}
      <div className="chart-heading">
        <h1>All Product</h1>
        <select
          aria-label="Chart year"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {Array.from({ length: 6 }, (_, i) => currentYear + 1 - i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </div>
      <div
        className="chart-frame"
        role="img"
        aria-label={`Monthly product totals for ${year}`}
      >
        {chart.isPending ? (
          <div className="skeleton h-full" />
        ) : chart.isError ? (
          <p role="alert">
            {errorMessage(chart.error)}{" "}
            <button onClick={() => void chart.refetch()}>Try again</button>
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chart.data}
              margin={{ top: 22, right: 24, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#78a8e6" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#d9deeb" stopOpacity={0.32} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f0f2f5" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#666" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={42}
                tick={{ fontSize: 10, fill: "#666" }}
              />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2a7bb8"
                strokeWidth={1.2}
                fill="url(#chart-fill)"
                dot={{ r: 3, fill: "white", strokeWidth: 1 }}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  fontSize={9}
                  fill="#777"
                />
              </Area>
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {chart.data && (
        <details className="chart-table">
          <summary>View chart data</summary>
          <table>
            <caption>Monthly totals, {year}</caption>
            <thead>
              <tr>
                <th>Month</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {chart.data.map((p) => (
                <tr key={p.month}>
                  <td>{p.month}</td>
                  <td>{p.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
