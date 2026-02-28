"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { format, subDays } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Trash2,
  LogOut,
  Quote,
  ChevronDown,
} from "lucide-react";

import type { Tables } from "@/types/database.types";

type Profile = Tables<"profiles">;
type Measurement = Tables<"measurements">;
type Quote = Tables<"quotes"> | null;

interface DashboardClientProps {
  profile: Profile;
  measurements: Measurement[];
  quote: Quote;
}

function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/** Returns weight (kg) at each BMI threshold for a given height. */
function getBMIZoneBoundaries(heightCm: number) {
  const heightM = heightCm / 100;
  const h2 = heightM * heightM;
  return {
    underweight: 18.5 * h2,
    healthy: 25 * h2,
    overweight: 30 * h2,
  };
}

const HISTORY_INITIAL_COUNT = 4;

export function DashboardClient({
  profile,
  measurements,
  quote,
}: DashboardClientProps) {
  const router = useRouter();
  const [weightInput, setWeightInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyCount, setHistoryCount] = useState(HISTORY_INITIAL_COUNT);
  const [showBMIZones, setShowBMIZones] = useState(false);
  const [showGoalLine, setShowGoalLine] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const visibleMeasurements = measurements.slice(0, historyCount);
  const hasMore = measurements.length > historyCount;

  const latestWeight = measurements[0]?.weight_kg ?? null;
  const heightCm = profile.height_cm ?? 170;
  const targetWeightKg = profile.target_weight_kg ?? null;
  const currentBMI = latestWeight
    ? calculateBMI(latestWeight, heightCm)
    : null;

  // 7-day stats: only measurements from the last 7 days
  const sevenDaysAgo = subDays(new Date(), 7);
  const measurementsLast7Days = measurements.filter((m) => {
    const d = new Date(m.created_at ?? "");
    return d >= sevenDaysAgo;
  });

  // Trend = change from oldest to newest within the 7-day window
  const trend =
    measurementsLast7Days.length >= 2
      ? (measurementsLast7Days[0]?.weight_kg ?? 0) - (measurementsLast7Days[measurementsLast7Days.length - 1]?.weight_kg ?? 0)
      : null;

  // Average = mean of all measurements in the last 7 days
  const rollingAvg =
    measurementsLast7Days.length > 0
      ? measurementsLast7Days.reduce((sum, m) => sum + m.weight_kg, 0) / measurementsLast7Days.length
      : null;

  const bmiZones = getBMIZoneBoundaries(heightCm);

  const chartMeasurements = showFullHistory ? measurements : measurements.slice(0, 50);
  const chartData = [...chartMeasurements].reverse().map((m) => ({
    id: m.id,
    date: format(new Date(m.created_at ?? ""), "MMM d"),
    weight: m.weight_kg,
    fullDate: m.created_at ?? "",
  }));

  const weightMin = chartData.length ? Math.min(...chartData.map((d) => d.weight)) : 0;
  const weightMax = chartData.length ? Math.max(...chartData.map((d) => d.weight)) : 100;
  const effectiveMin = [
    weightMin - 2,
    showBMIZones ? bmiZones.underweight - 5 : Infinity,
    showGoalLine && targetWeightKg != null ? targetWeightKg - 5 : Infinity,
  ].reduce((a, b) => Math.min(a, b));
  const effectiveMax = [
    weightMax + 5,
    showGoalLine && targetWeightKg != null ? targetWeightKg + 5 : 0,
  ].reduce((a, b) => Math.max(a, b));
  const yDomainMin = effectiveMin;
  const yDomainMax = effectiveMax;

  // Y-axis ticks in 5 kg steps
  const yTicks = (() => {
    const min = Math.floor(yDomainMin / 5) * 5;
    const max = Math.ceil(yDomainMax / 5) * 5;
    const ticks: number[] = [];
    for (let kg = min; kg <= max; kg += 5) {
      ticks.push(kg);
    }
    return ticks;
  })();

  async function handleAddWeight(e: React.FormEvent) {
    e.preventDefault();
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight < 20 || weight > 300) return;

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("measurements").insert({
      user_id: profile.id,
      weight_kg: weight,
    });

    setSubmitting(false);
    setWeightInput("");
    if (error) return;

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#f97316", "#7c3aed", "#e8e4ef"],
    });
    router.refresh();
  }

  async function handleDelete(id: number) {
    const supabase = createClient();
    await supabase.from("measurements").delete().eq("id", id);
    router.refresh();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen p-4 pb-8 md:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-7 w-7 text-[var(--accent)]" />
          <span className="text-xl font-bold">Progress Pals</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </header>

      {/* Quote */}
      {quote && (
        <Card className="mb-6 border-[var(--accent)]/30 bg-[var(--accent)]/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Quote className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="text-sm italic text-[var(--muted-foreground)]">
                &ldquo;{quote.text}&rdquo;
              </p>
              {quote.author && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  — {quote.author}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Log your weight</CardTitle>
          <CardDescription>Track your progress with each measurement</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddWeight} className="flex gap-2">
            <Input
              type="number"
              step="0.1"
              min={20}
              max={300}
              placeholder="Weight (kg)"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="text-lg"
            />
            <Button type="submit" disabled={submitting}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Current BMI</CardDescription>
            <CardTitle className="text-2xl">
              {currentBMI != null ? currentBMI.toFixed(1) : "—"}
            </CardTitle>
            {currentBMI != null && (
              <p className="text-sm text-[var(--muted-foreground)]">
                {getBMICategory(currentBMI)}
              </p>
            )}
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={showBMIZones}
                onChange={(e) => setShowBMIZones(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--muted)] accent-[var(--accent)]"
              />
              <span>Show BMI zones on chart</span>
            </label>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>7-day</CardDescription>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-base">
                <span className="text-[var(--muted-foreground)]">Trend:</span>
                {trend !== null ? (
                  <span className="flex items-center gap-1 text-lg font-medium">
                    {trend > 0 && <TrendingUp className="h-5 w-5 text-amber-500" />}
                    {trend < 0 && <TrendingDown className="h-5 w-5 text-emerald-500" />}
                    {trend === 0 && <Minus className="h-5 w-5 text-[var(--muted-foreground)]" />}
                    {trend > 0 ? "+" : ""}
                    {trend.toFixed(1)} kg
                  </span>
                ) : (
                  <span className="text-lg text-[var(--muted-foreground)]">N/A</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-base">
                <span className="text-[var(--muted-foreground)]">Average:</span>
                <span className="text-lg font-medium">
                  {rollingAvg != null ? `${rollingAvg.toFixed(1)} kg` : (
                    <span className="text-[var(--muted-foreground)]">N/A</span>
                  )}
                </span>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Goals</CardDescription>
            {targetWeightKg != null && (
              <p className="text-2xl font-semibold text-[var(--accent)]">
                {targetWeightKg} kg
              </p>
            )}
            {targetWeightKg == null && (
              <p className="text-sm text-[var(--muted-foreground)]">No target set</p>
            )}
            {targetWeightKg != null && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <input
                  type="checkbox"
                  checked={showGoalLine}
                  onChange={(e) => setShowGoalLine(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--muted)] accent-[var(--accent)]"
                />
                <span>Show goal line on chart</span>
              </label>
            )}
          </CardHeader>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Weight over time</CardTitle>
              {showBMIZones && (
                <CardDescription>Based on your personal information</CardDescription>
              )}
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={showFullHistory}
                onChange={(e) => setShowFullHistory(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-[var(--border)] bg-[var(--muted)] accent-[var(--accent)]"
              />
              <span>Show full history</span>
            </label>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" key={`${showBMIZones}-${showGoalLine}`}>
                <LineChart
                  data={chartData}
                  margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="fullDate"
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    tickFormatter={(value) => format(new Date(value), "MMM d yyyy")}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={12}
                    domain={[yDomainMin, yDomainMax]}
                    ticks={yTicks}
                    tickFormatter={(value) => `${Math.round(value)} kg`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                    }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0];
                      const weight = point.value;
                      const fullDate = point.payload?.fullDate;
                      return (
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-lg">
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {fullDate
                              ? format(new Date(fullDate), "PPp")
                              : point.payload?.date}
                          </p>
                          <p className="text-sm text-[var(--accent)]">
                            {weight != null ? `${weight} kg` : ""}
                          </p>
                        </div>
                      );
                    }}
                  />
                  {/* BMI zones: Underweight <18.5, Healthy 18.5-24.9, Overweight 25-29.9, Obesity 30+ */}
                  {showBMIZones && (
                    <>
                      <ReferenceArea
                        y1={0}
                        y2={bmiZones.underweight}
                        fill="#ef4444"
                        fillOpacity={0.2}
                      />
                      <ReferenceArea
                        y1={bmiZones.underweight}
                        y2={bmiZones.healthy}
                        fill="#22c55e"
                        fillOpacity={0.2}
                      />
                      <ReferenceArea
                        y1={bmiZones.healthy}
                        y2={bmiZones.overweight}
                        fill="#eab308"
                        fillOpacity={0.2}
                      />
                      <ReferenceArea
                        y1={bmiZones.overweight}
                        y2={bmiZones.overweight + 50}
                        fill="#ef4444"
                        fillOpacity={0.2}
                      />
                      <ReferenceLine
                        y={bmiZones.underweight}
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        label={{ value: "18.5", position: "right", fill: "var(--muted-foreground)" }}
                      />
                      <ReferenceLine
                        y={bmiZones.healthy}
                        stroke="#22c55e"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        label={{ value: "25.0", position: "right", fill: "var(--muted-foreground)" }}
                      />
                      <ReferenceLine
                        y={bmiZones.overweight}
                        stroke="#ef4444"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        label={{ value: "30.0", position: "right", fill: "var(--muted-foreground)" }}
                      />
                    </>
                  )}
                  {showGoalLine && targetWeightKg != null && (
                    <ReferenceLine
                      y={targetWeightKg}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{ value: "Goal", position: "right", fill: "var(--accent)" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ fill: "var(--accent)", r: 4 }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Past weight entries</CardDescription>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="py-8 text-center text-[var(--muted-foreground)]">
              No measurements yet. Add your first weight above!
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {visibleMeasurements.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                  >
                    <div>
                      <span className="font-semibold">{m.weight_kg} kg</span>
                      <span className="ml-2 text-sm text-[var(--muted-foreground)]">
                        {format(new Date(m.created_at ?? ""), "PP")}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(m.id)}
                      className="text-red-400 hover:bg-red-500/20 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {hasMore && (
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => setHistoryCount((c) => c + HISTORY_INITIAL_COUNT)}
                >
                  Load more ({measurements.length - historyCount} left)
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
