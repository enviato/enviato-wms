"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import NotificationBell from "@/modules/notifications/components/NotificationBell";
import {
  ArrowUpRight,
  ArrowDownRight,
  Package,
  Truck,
  Warehouse,
  Clock,
} from "lucide-react";

type Period = "day" | "week" | "month" | "quarter" | "year";

type StatCardData = {
  value: number;
  previousValue: number;
  label: string;
  trend: "up" | "down" | "neutral";
  icon: typeof Package;
  color: string;
};

type ChartData = {
  date: string;
  count: number;
};

type RankingRow = {
  rank: number;
  name: string;
  value: number;
};

/** Shapes returned by the analytics queries — used instead of `any`. */
type AnalyticsPackageRow = {
  id: string;
  checked_in_at: string;
  checked_out_at: string | null;
  status: string;
  customer_id: string | null;
  courier_group_id: string | null;
  customer: { first_name: string; last_name: string } | null;
  courier_group: { name: string; code: string } | null;
};

type AnalyticsInvoiceRow = {
  customer_id: string | null;
  total: number | null;
  customer: { first_name: string; last_name: string } | null;
};

export default function AnalyticsPage() {
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>("month");
  const [loading, setLoading] = useState(true);

  // Stats
  const [scannedIn, setScannedIn] = useState({ value: 0, previousValue: 0, trend: "neutral" as "up" | "down" | "neutral" });
  const [scannedOut, setScannedOut] = useState({ value: 0, previousValue: 0, trend: "neutral" as "up" | "down" | "neutral" });
  const [inStock, setInStock] = useState({ value: 0, previousValue: 0, trend: "neutral" as "up" | "down" | "neutral" });
  const [turnaroundTime, setTurnaroundTime] = useState({ value: 0, previousValue: 0, trend: "neutral" as "up" | "down" | "neutral" });

  // Charts
  const [checkedInData, setCheckedInData] = useState<ChartData[]>([]);
  const [checkedOutData, setCheckedOutData] = useState<ChartData[]>([]);
  const [turnaroundChartData, setTurnaroundChartData] = useState<ChartData[]>([]);

  // Rankings
  const [topRecipients, setTopRecipients] = useState<RankingRow[]>([]);
  const [topScanners, setTopScanners] = useState<RankingRow[]>([]);
  const [topCouriers, setTopCouriers] = useState<RankingRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<RankingRow[]>([]);

  // Calculate date ranges based on period
  const getDateRanges = (selectedPeriod: Period) => {
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;
    let prevPeriodStart: Date;
    let prevPeriodEnd: Date;

    switch (selectedPeriod) {
      case "day": {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        periodStart = today;
        periodEnd = new Date(today);
        periodEnd.setHours(23, 59, 59, 999);
        prevPeriodStart = yesterday;
        prevPeriodEnd = new Date(yesterday);
        prevPeriodEnd.setHours(23, 59, 59, 999);
        break;
      }
      case "week": {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const prevStartOfWeek = new Date(startOfWeek);
        prevStartOfWeek.setDate(prevStartOfWeek.getDate() - 7);
        const prevEndOfWeek = new Date(startOfWeek);
        prevEndOfWeek.setHours(23, 59, 59, 999);
        periodStart = startOfWeek;
        periodEnd = new Date(now);
        prevPeriodStart = prevStartOfWeek;
        prevPeriodEnd = prevEndOfWeek;
        break;
      }
      case "month": {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const prevStartOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevEndOfMonth = new Date(startOfMonth);
        prevEndOfMonth.setHours(23, 59, 59, 999);
        periodStart = startOfMonth;
        periodEnd = new Date(now);
        prevPeriodStart = prevStartOfMonth;
        prevPeriodEnd = prevEndOfMonth;
        break;
      }
      case "quarter": {
        const quarter = Math.floor(now.getMonth() / 3);
        const startOfQuarter = new Date(now.getFullYear(), quarter * 3, 1);
        const prevStartOfQuarter = new Date(now.getFullYear(), quarter * 3 - 3, 1);
        const prevEndOfQuarter = new Date(startOfQuarter);
        prevEndOfQuarter.setHours(23, 59, 59, 999);
        periodStart = startOfQuarter;
        periodEnd = new Date(now);
        prevPeriodStart = prevStartOfQuarter;
        prevPeriodEnd = prevEndOfQuarter;
        break;
      }
      case "year": {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const prevStartOfYear = new Date(now.getFullYear() - 1, 0, 1);
        const prevEndOfYear = new Date(startOfYear);
        prevEndOfYear.setHours(23, 59, 59, 999);
        periodStart = startOfYear;
        periodEnd = new Date(now);
        prevPeriodStart = prevStartOfYear;
        prevPeriodEnd = prevEndOfYear;
        break;
      }
    }

    return {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      prevPeriodStart: prevPeriodStart.toISOString(),
      prevPeriodEnd: prevPeriodEnd.toISOString(),
    };
  };

  // Generate chart dates based on period
  const generateChartDates = (selectedPeriod: Period): Date[] => {
    const now = new Date();
    const dates: Date[] = [];

    switch (selectedPeriod) {
      case "day": {
        for (let i = 0; i < 24; i++) {
          const d = new Date(now);
          d.setHours(i, 0, 0, 0);
          dates.push(d);
        }
        break;
      }
      case "week": {
        for (let i = 0; i < 7; i++) {
          const d = new Date(now);
          d.setDate(now.getDate() - now.getDay() + i);
          d.setHours(0, 0, 0, 0);
          dates.push(d);
        }
        break;
      }
      case "month": {
        const year = now.getFullYear();
        const month = now.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(year, month, i);
          dates.push(d);
        }
        break;
      }
      case "quarter": {
        const quarter = Math.floor(now.getMonth() / 3);
        const startMonth = quarter * 3;
        for (let m = 0; m < 3; m++) {
          const d = new Date(now.getFullYear(), startMonth + m, 1);
          dates.push(d);
        }
        break;
      }
      case "year": {
        for (let m = 0; m < 12; m++) {
          const d = new Date(now.getFullYear(), m, 1);
          dates.push(d);
        }
        break;
      }
    }

    return dates;
  };

  // Helper: assign a package to a date bucket key based on a timestamp field
  const getBucketKey = (timestamp: string, selectedPeriod: Period): string => {
    const d = new Date(timestamp);
    if (selectedPeriod === "day") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else if (selectedPeriod === "quarter" || selectedPeriod === "year") {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    } else {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  };

  // Load analytics data — optimised: 4 bulk queries instead of 90+
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const { periodStart, periodEnd, prevPeriodStart, prevPeriodEnd } = getDateRanges(period);

        // ─── All 4 queries fire in parallel ───
        const [checkedInRes, checkedOutRes, inStockRes, invoiceRes] = await Promise.all([
          supabase
            .from("packages")
            .select("id, checked_in_at, checked_out_at, status, customer_id, courier_group_id, customer:users!packages_customer_id_fkey(first_name, last_name), courier_group:courier_groups(name, code)")
            .is("deleted_at", null)
            .gte("checked_in_at", prevPeriodStart)
            .lte("checked_in_at", periodEnd)
            .limit(5000),
          supabase
            .from("packages")
            .select("id, checked_out_at")
            .is("deleted_at", null)
            .not("checked_out_at", "is", null)
            .gte("checked_out_at", prevPeriodStart)
            .lte("checked_out_at", periodEnd)
            .limit(5000),
          supabase
            .from("packages")
            .select("*", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("status", "checked_in"),
          supabase
            .from("invoices")
            .select("customer_id, total, customer:users!invoices_customer_id_fkey(first_name, last_name)")
            .is("deleted_at", null),
        ]);

        if (checkedInRes.error) {
          console.error("packages (checked_in) query:", checkedInRes.error.message);
        }
        if (checkedOutRes.error) {
          console.error("packages (checked_out) query:", checkedOutRes.error.message);
        }
        if (inStockRes.error) {
          console.error("packages (in_stock) query:", inStockRes.error.message);
        }
        if (invoiceRes.error) {
          console.error("invoices query:", invoiceRes.error.message);
        }

        const allCheckedIn = checkedInRes.data as AnalyticsPackageRow[] | null;
        const allCheckedOut = checkedOutRes.data as { id: string; checked_out_at: string }[] | null;
        const currentInStock = inStockRes.count;
        const invoiceData = invoiceRes.data as AnalyticsInvoiceRow[] | null;

        const pkgsIn = allCheckedIn || [];
        const pkgsOut = allCheckedOut || [];

        const currentPkgsIn = pkgsIn.filter((p) => p.checked_in_at >= periodStart && p.checked_in_at <= periodEnd);
        const prevPkgsIn = pkgsIn.filter((p) => p.checked_in_at >= prevPeriodStart && p.checked_in_at <= prevPeriodEnd);
        const currentPkgsOut = pkgsOut.filter((p) => p.checked_out_at! >= periodStart && p.checked_out_at! <= periodEnd);
        const prevPkgsOut = pkgsOut.filter((p) => p.checked_out_at! >= prevPeriodStart && p.checked_out_at! <= prevPeriodEnd);

        // Stat Cards
        setScannedIn({
          value: currentPkgsIn.length,
          previousValue: prevPkgsIn.length,
          trend: currentPkgsIn.length >= prevPkgsIn.length ? "up" : "down",
        });
        setScannedOut({
          value: currentPkgsOut.length,
          previousValue: prevPkgsOut.length,
          trend: currentPkgsOut.length >= prevPkgsOut.length ? "up" : "down",
        });

        const prevInStockCount = prevPkgsIn.filter((p) => !p.checked_out_at || p.checked_out_at > prevPeriodEnd).length;
        setInStock({
          value: currentInStock || 0,
          previousValue: prevInStockCount,
          trend: (currentInStock || 0) >= prevInStockCount ? "up" : "down",
        });

        const calcAvgTurnaround = (pkgs: typeof pkgsIn) => {
          const withOut = pkgs.filter((p) => p.checked_out_at);
          if (withOut.length === 0) return 0;
          const totalDays = withOut.reduce((sum, p) => {
            return sum + (new Date(p.checked_out_at!).getTime() - new Date(p.checked_in_at).getTime()) / (1000 * 60 * 60 * 24);
          }, 0);
          return totalDays / withOut.length;
        };

        const currentAvgTurnaround = calcAvgTurnaround(currentPkgsIn);
        const prevAvgTurnaround = calcAvgTurnaround(prevPkgsIn);
        setTurnaroundTime({
          value: Math.round(currentAvgTurnaround * 100) / 100,
          previousValue: Math.round(prevAvgTurnaround * 100) / 100,
          trend: currentAvgTurnaround <= prevAvgTurnaround ? "up" : "down",
        });

        // Chart Data
        const chartDates = generateChartDates(period);

        const inBuckets = new Map<string, number>();
        currentPkgsIn.forEach((p) => {
          const key = getBucketKey(p.checked_in_at, period);
          inBuckets.set(key, (inBuckets.get(key) || 0) + 1);
        });

        const outBuckets = new Map<string, number>();
        currentPkgsOut.forEach((p) => {
          const key = getBucketKey(p.checked_out_at!, period);
          outBuckets.set(key, (outBuckets.get(key) || 0) + 1);
        });

        const turnaroundBuckets = new Map<string, { totalDays: number; count: number }>();
        currentPkgsIn.filter((p) => p.checked_out_at).forEach((p) => {
          const key = getBucketKey(p.checked_in_at, period);
          const days = (new Date(p.checked_out_at!).getTime() - new Date(p.checked_in_at).getTime()) / (1000 * 60 * 60 * 24);
          const existing = turnaroundBuckets.get(key) || { totalDays: 0, count: 0 };
          turnaroundBuckets.set(key, { totalDays: existing.totalDays + days, count: existing.count + 1 });
        });

        setCheckedInData(chartDates.map((d) => {
          const key = d.toISOString().split("T")[0];
          return { date: key, count: inBuckets.get(key) || 0 };
        }));
        setCheckedOutData(chartDates.map((d) => {
          const key = d.toISOString().split("T")[0];
          return { date: key, count: outBuckets.get(key) || 0 };
        }));
        setTurnaroundChartData(chartDates.map((d) => {
          const key = d.toISOString().split("T")[0];
          const bucket = turnaroundBuckets.get(key);
          const avg = bucket ? bucket.totalDays / bucket.count : 0;
          return { date: key, count: Math.round(avg * 100) / 100 };
        }));

        // Rankings
        const recipientMap = new Map<string, { name: string; count: number }>();
        currentPkgsIn.forEach((pkg: AnalyticsPackageRow) => {
          if (pkg.customer_id && pkg.customer) {
            const name = `${pkg.customer.first_name} ${pkg.customer.last_name}`;
            recipientMap.set(pkg.customer_id, {
              name,
              count: (recipientMap.get(pkg.customer_id)?.count || 0) + 1,
            });
          }
        });
        setTopRecipients(
          Array.from(recipientMap.values()).sort((a, b) => b.count - a.count).slice(0, 5)
            .map((item, idx) => ({ rank: idx + 1, name: item.name, value: item.count }))
        );
        setTopScanners([]);

        const courierMap = new Map<string, { name: string; count: number }>();
        currentPkgsIn.forEach((pkg: AnalyticsPackageRow) => {
          if (pkg.courier_group_id && pkg.courier_group) {
            const name = pkg.courier_group.name || pkg.courier_group.code;
            courierMap.set(pkg.courier_group_id, {
              name,
              count: (courierMap.get(pkg.courier_group_id)?.count || 0) + 1,
            });
          }
        });
        setTopCouriers(
          Array.from(courierMap.values()).sort((a, b) => b.count - a.count).slice(0, 5)
            .map((item, idx) => ({ rank: idx + 1, name: item.name, value: item.count }))
        );

        const customerMap = new Map<string, { name: string; total: number }>();
        if (invoiceData) {
          invoiceData.forEach((inv: AnalyticsInvoiceRow) => {
            if (inv.customer_id && inv.customer) {
              const name = `${inv.customer.first_name} ${inv.customer.last_name}`;
              const existing = customerMap.get(inv.customer_id);
              customerMap.set(inv.customer_id, {
                name,
                total: (existing?.total || 0) + (inv.total || 0),
              });
            }
          });
        }
        setTopCustomers(
          Array.from(customerMap.values()).sort((a, b) => b.total - a.total).slice(0, 5)
            .map((item, idx) => ({ rank: idx + 1, name: item.name, value: Math.round(item.total * 100) / 100 }))
        );
      } catch (error) {
        console.error("Error loading analytics:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [period]);

  const statsData: StatCardData[] = [
    { label: "Packages Scanned In", value: scannedIn.value, previousValue: scannedIn.previousValue, trend: scannedIn.trend, icon: Package, color: "text-primary" },
    { label: "Packages Scanned Out", value: scannedOut.value, previousValue: scannedOut.previousValue, trend: scannedOut.trend, icon: Truck, color: "text-emerald-600" },
    { label: "Currently In Stock", value: inStock.value, previousValue: inStock.previousValue, trend: inStock.trend, icon: Warehouse, color: "text-amber-600" },
    { label: "Avg Turnaround (days)", value: turnaroundTime.value, previousValue: turnaroundTime.previousValue, trend: turnaroundTime.trend, icon: Clock, color: "text-violet-600" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ════════ Header ════════ */}
      <header className="h-14 bg-white border-b border-border flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <h2 className="text-title text-txt-primary">Analytics</h2>
          <span className="text-meta text-txt-tertiary tracking-tight hidden sm:inline-block">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
        </div>
      </header>

      {/* ════════ Filter Bar ════════ */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-2.5 flex items-center gap-3 shrink-0">
        <span className="text-meta text-txt-tertiary tracking-tight">Period</span>
        <div className="flex items-center gap-1.5">
          {(["day", "week", "month", "quarter", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`filter-pill transition-colors duration-150 cursor-pointer ${period === p ? "active" : ""}`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ════════ Scrollable Content ════════ */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-5 space-y-4">
          {/* ── Stat Cards ── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statsData.map((stat, idx) => (
              <StatCard key={idx} data={stat} loading={loading} />
            ))}
          </section>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard title="Packages Checked In" loading={loading}>
              <ResponsiveBarChart data={checkedInData} color="#484c5b" />
            </ChartCard>
            <ChartCard title="Packages Checked Out" loading={loading}>
              <ResponsiveBarChart data={checkedOutData} color="#10b981" />
            </ChartCard>
          </div>

          {/* ── Turnaround Time Chart ── */}
          <ChartCard title="Turnaround Time Trend (days)" loading={loading}>
            <ResponsiveLineChart data={turnaroundChartData} />
          </ChartCard>

          {/* ── Rankings ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <RankingCard title="Top Receiving Recipients" data={topRecipients} loading={loading} />
            <RankingCard title="Top Couriers" data={topCouriers} loading={loading} />
            <RankingCard title="Top Scanning Users" data={topScanners} loading={loading} placeholder="No scanner data available" />
            <RankingCard title="Top Grossing Customers" data={topCustomers} loading={loading} isCurrency />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Stat Card ───────── */
function StatCard({ data, loading }: { data: StatCardData; loading: boolean }) {
  const percentChange = calcPercentChange(data.value, data.previousValue);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-meta text-txt-tertiary tracking-tight">{data.label}</p>
        <div className="w-8 h-8 rounded-md bg-surface-secondary flex items-center justify-center">
          <data.icon size={16} strokeWidth={1.75} className={data.color} />
        </div>
      </div>
      <p className="text-2xl font-bold text-txt-primary tracking-tighter leading-none mb-2">
        {loading ? <span className="inline-block w-12 h-7 skeleton-pulse rounded" /> : data.value}
      </p>
      <div className="flex items-center gap-1.5">
        {!loading && data.trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
        {!loading && data.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
        <span className={`text-meta ${data.trend === "up" ? "text-emerald-500" : data.trend === "down" ? "text-red-500" : "text-txt-secondary"}`}>
          {loading ? <span className="inline-block w-8 h-3 skeleton-pulse rounded" /> : percentChange}
        </span>
        <span className="text-txt-tertiary text-meta hidden sm:inline">vs prev</span>
      </div>
    </div>
  );
}

/* ───────── Chart Card wrapper ───────── */
function ChartCard({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-md p-4">
      <p className="text-meta text-txt-tertiary tracking-tight mb-3">{title}</p>
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-2">
          <div className="w-3/4 h-4 skeleton-pulse rounded" />
          <div className="w-1/2 h-4 skeleton-pulse rounded" />
          <div className="w-2/3 h-4 skeleton-pulse rounded" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/* ───────── Responsive Bar Chart ───────── */
function ResponsiveBarChart({ data, color = "#484c5b" }: { data: ChartData[]; color?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-txt-tertiary text-ui-sm">No data available</div>;
  }

  const chartData = data.map((d) => ({ ...d, date: fmtDate(d.date) }));

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <BarChart
        dataset={chartData}
        xAxis={[{ scaleType: "band" as const, dataKey: "date" }]}
        series={[{ dataKey: "count", label: "Count", color }]}
        width={width}
        height={280}
        margin={{ top: 10, bottom: 30, left: 40, right: 10 }}
        slotProps={{ legend: { hidden: true } as Record<string, unknown> }}
        sx={chartSx}
      />
    </div>
  );
}

/* ───────── Responsive Line Chart ───────── */
function ResponsiveLineChart({ data }: { data: ChartData[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-txt-tertiary text-ui-sm">No data available</div>;
  }

  const chartData = data.map((d) => ({ ...d, date: fmtDate(d.date) }));

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <LineChart
        dataset={chartData}
        xAxis={[{ scaleType: "point" as const, dataKey: "date" }]}
        series={[{ dataKey: "count", label: "Days", color: "#ff495c", curve: "linear" as const }]}
        width={width}
        height={280}
        margin={{ top: 10, bottom: 30, left: 40, right: 10 }}
        slotProps={{ legend: { hidden: true } as Record<string, unknown> }}
        sx={chartSx}
      />
    </div>
  );
}

/* ───────── Ranking Card ───────── */
function RankingCard({
  title,
  data,
  loading,
  isCurrency = false,
  placeholder = "No data available",
}: {
  title: string;
  data: RankingRow[];
  loading: boolean;
  isCurrency?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="bg-white border border-border rounded-md p-4">
      <p className="text-meta text-txt-tertiary tracking-tight mb-3">{title}</p>

      {loading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-4 skeleton-pulse rounded" />
              <div className="flex-1 h-4 skeleton-pulse rounded" />
              <div className="w-10 h-4 skeleton-pulse rounded" />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-8 text-txt-tertiary text-muted">{placeholder}</div>
      ) : (
        <div className="space-y-2.5">
          {data.map((row) => (
            <div key={row.rank} className="flex items-center gap-3 border-b border-border pb-2.5 last:border-b-0 last:pb-0">
              <div className="w-6 h-6 rounded bg-surface-secondary flex items-center justify-center text-txt-tertiary text-meta shrink-0">
                {row.rank}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-txt-primary text-ui-sm truncate">{row.name}</p>
              </div>
              <p className="text-txt-secondary text-ui-sm font-semibold tabular-nums">
                {isCurrency ? `$${row.value.toFixed(2)}` : row.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── Shared helpers ───────── */
function calcPercentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${Math.round(change)}%`;
}

function fmtDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const chartSx = {
  "& .MuiChartsAxis-left .MuiChartsAxis-tickLabelStyle": { fill: "#85878b", fontSize: "11px" },
  "& .MuiChartsAxis-bottom .MuiChartsAxis-tickLabelStyle": { fill: "#85878b", fontSize: "11px" },
  "& .MuiChartsAxis-root line": { stroke: "#e9e9eb" },
};
