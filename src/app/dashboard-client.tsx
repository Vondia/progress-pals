"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, addMonths, differenceInDays } from "date-fns";
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
  Target,
  Trophy,
  AlertTriangle,
} from "lucide-react";

import type { Tables } from "@/types/database.types";

type Profile = Tables<"profiles">;
type Measurement = Tables<"measurements">;
type Goal = Tables<"goals">;
type Quote = Tables<"quotes"> | null;

interface DashboardClientProps {
  profile: Profile;
  measurements: Measurement[];
  goals: Goal[];
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
  goals,
  quote,
}: DashboardClientProps) {
  const router = useRouter();
  const [weightInput, setWeightInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [historyCount, setHistoryCount] = useState(HISTORY_INITIAL_COUNT);
  const [showBMIZones, setShowBMIZones] = useState(false);
  const [showGoalLine, setShowGoalLine] = useState(false);
  const [showShortTermGoalLine, setShowShortTermGoalLine] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Measurement | null>(null);
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null);
  const [ambitiousPopoverGoalId, setAmbitiousPopoverGoalId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [goalWeight, setGoalWeight] = useState("");
  const [goalDeadline, setGoalDeadline] = useState("");
  const [goalSubmitting, setGoalSubmitting] = useState(false);

  const visibleMeasurements = measurements.slice(0, historyCount);
  const hasMore = measurements.length > historyCount;

  const now = new Date();
  const upcomingShortTermGoal = goals
    .filter((g) => g.status !== "achieved" && new Date(g.deadline) >= now)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())[0] ?? null;

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

  const chartLimit =
    showFullHistory ? measurements.length : (showGoalLine || showShortTermGoalLine ? 25 : 50);
  const chartMeasurements = showFullHistory ? measurements : measurements.slice(0, chartLimit);
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
    showShortTermGoalLine && upcomingShortTermGoal ? upcomingShortTermGoal.target_weight_kg - 5 : Infinity,
  ].reduce((a, b) => Math.min(a, b));
  const effectiveMax = [
    weightMax + 5,
    showGoalLine && targetWeightKg != null ? targetWeightKg + 5 : 0,
    showShortTermGoalLine && upcomingShortTermGoal ? upcomingShortTermGoal.target_weight_kg + 5 : 0,
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

    // Check if any goal was achieved
    const achievedGoals = goals.filter(
      (g) => g.status !== "achieved" && weight <= g.target_weight_kg
    );
    if (achievedGoals.length > 0) {
      const supabaseGoal = createClient();
      for (const g of achievedGoals) {
        await supabaseGoal.from("goals").update({ status: "achieved" }).eq("id", g.id);
      }
      const confettiModule = await import("canvas-confetti");
      const confetti = confettiModule.default ?? confettiModule;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.5, y: 0.6 },
        colors: ["#f97316", "#7c3aed", "#e8e4ef"],
        zIndex: 9999,
      });
      setTimeout(() => router.refresh(), 800);
      return;
    }

    // Celebrate only when weight has gone down
    if (latestWeight != null && weight < latestWeight) {
      const confettiModule = await import("canvas-confetti");
      const confetti = confettiModule.default ?? confettiModule;
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { x: 0.5, y: 0.6 },
        colors: ["#f97316", "#7c3aed", "#e8e4ef"],
        zIndex: 9999,
      });
      // Delay refresh so confetti has time to render before the page re-renders
      setTimeout(() => router.refresh(), 800);
    } else {
      router.refresh();
    }
  }

  async function handleAddGoal(e: React.FormEvent) {
    e.preventDefault();
    const weight = parseFloat(goalWeight);
    if (isNaN(weight) || weight < 20 || weight > 300) return;

    setGoalSubmitting(true);
    const deadline = goalDeadline
      ? new Date(goalDeadline).toISOString().split("T")[0]
      : format(addMonths(new Date(), 2), "yyyy-MM-dd");

    const supabase = createClient();
    const { error } = await supabase.from("goals").insert({
      user_id: profile.id,
      target_weight_kg: weight,
      deadline,
    });

    setGoalSubmitting(false);
    setGoalWeight("");
    setGoalDeadline("");
    if (error) return;

    router.refresh();
  }

  async function handleDelete(id: number) {
    const supabase = createClient();
    await supabase.from("measurements").delete().eq("id", id);
    setDeleteTarget(null);
    router.refresh();
  }

  async function handleDeleteGoal(id: string) {
    const supabase = createClient();
    await supabase.from("goals").delete().eq("id", id);
    setDeleteGoalTarget(null);
    router.refresh();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen w-full max-w-full p-4 pb-8 md:p-6 lg:px-8 xl:px-12">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-7 w-7 text-(--accent)" />
          <span className="text-xl font-bold">Progress Pals</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </header>

      {/* Quote */}
      {quote && (
        <Card className="mb-6 border-(--accent)/30 bg-(--accent)/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Quote className="mt-0.5 h-5 w-5 shrink-0 text-(--accent)" />
            <div>
              <p className="text-sm italic text-(--muted-foreground)">
                &ldquo;{quote.text}&rdquo;
              </p>
              {quote.author && (
                <p className="mt-1 text-xs text-(--muted-foreground)">
                  — {quote.author}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight input & Short-term goal */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Log your weight</h3>
              <p className="mb-2 text-sm text-(--muted-foreground)">
                Track your progress with each measurement
              </p>
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
            </div>
            <div>
              <h3 className="font-semibold">Set Short-Term Goal</h3>
              <p className="mb-2 text-sm text-(--muted-foreground)">
                Goal weight and deadline
              </p>
              <form onSubmit={handleAddGoal} className="flex flex-wrap gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min={20}
                  max={300}
                  placeholder="Goal (kg)"
                  value={goalWeight}
                  onChange={(e) => setGoalWeight(e.target.value)}
                  className="w-24"
                  required
                />
                <Input
                  type="date"
                  value={goalDeadline}
                  onChange={(e) => setGoalDeadline(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="w-36"
                />
                <Button type="submit" disabled={goalSubmitting}>
                  Add Goal
                </Button>
              </form>
            </div>
          </div>
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
              <p className="text-sm text-(--muted-foreground)">
                {getBMICategory(currentBMI)}
              </p>
            )}
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-(--muted-foreground)">
              <input
                type="checkbox"
                checked={showBMIZones}
                onChange={(e) => setShowBMIZones(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-(--border) bg-(--muted) accent-(--accent)"
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
                <span className="text-(--muted-foreground)">Trend:</span>
                {trend !== null ? (
                  <span className="flex items-center gap-1 text-lg font-medium">
                    {trend > 0 && <TrendingUp className="h-5 w-5 text-amber-500" />}
                    {trend < 0 && <TrendingDown className="h-5 w-5 text-emerald-500" />}
                    {trend === 0 && <Minus className="h-5 w-5 text-(--muted-foreground)" />}
                    {trend > 0 ? "+" : ""}
                    {trend.toFixed(1)} kg
                  </span>
                ) : (
                  <span className="text-lg text-(--muted-foreground)">N/A</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-base">
                <span className="text-(--muted-foreground)">Average:</span>
                <span className="text-lg font-medium">
                  {rollingAvg != null ? `${rollingAvg.toFixed(1)} kg` : (
                    <span className="text-(--muted-foreground)">N/A</span>
                  )}
                </span>
              </div>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Goals</CardDescription>
            <div className="relative">
              {upcomingShortTermGoal ? (
                <p className="text-2xl font-semibold text-(--accent)">
                  {upcomingShortTermGoal.target_weight_kg} kg
                </p>
              ) : (
                <p className="text-sm text-(--muted-foreground)">No short-term goal</p>
              )}
              {targetWeightKg != null && (
                <p className="absolute right-0 top-0 text-xs text-(--muted-foreground)">
                  Long-term: {targetWeightKg} kg
                </p>
              )}
            </div>
            <div className="mt-2 space-y-1">
              {targetWeightKg != null && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-(--muted-foreground)">
                  <input
                    type="checkbox"
                    checked={showGoalLine}
                    onChange={(e) => setShowGoalLine(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-(--border) bg-(--muted) accent-(--accent)"
                  />
                  <span>Show long-term goal line</span>
                </label>
              )}
              {upcomingShortTermGoal != null && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-(--muted-foreground)">
                  <input
                    type="checkbox"
                    checked={showShortTermGoalLine}
                    onChange={(e) => setShowShortTermGoalLine(e.target.checked)}
                    className="h-4 w-4 cursor-pointer rounded border-(--border) bg-(--muted) accent-(--accent)"
                  />
                  <span>Show short-term goal line</span>
                </label>
              )}
            </div>
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
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-(--muted-foreground)">
              <input
                type="checkbox"
                checked={showFullHistory}
                onChange={(e) => setShowFullHistory(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-(--border) bg-(--muted) accent-(--accent)"
              />
              <span>Show full history</span>
            </label>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%" key={`${showBMIZones}-${showGoalLine}-${showShortTermGoalLine}`}>
                <LineChart
                  data={chartData}
                  margin={{
                    top: 5,
                    right: showBMIZones || showGoalLine || showShortTermGoalLine ? 70 : 20,
                    left: 0,
                    bottom: 5,
                  }}
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
                        <div className="rounded-lg border border-(--border) bg-(--card) p-2 shadow-lg text-base">
                          <p className="font-medium text-foreground">
                            {fullDate
                              ? format(new Date(fullDate), "PPp")
                              : point.payload?.date}
                          </p>
                          <p className="text-(--accent)">
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
                      label={{ value: "Long-term", position: "right", fill: "var(--accent)" }}
                    />
                  )}
                  {showShortTermGoalLine && upcomingShortTermGoal != null && (
                    <ReferenceLine
                      y={upcomingShortTermGoal.target_weight_kg}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      label={{ value: "Short-term", position: "right", fill: "var(--accent)" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ fill: "var(--accent)", r: isMobile ? 2.5 : 4 }}
                    activeDot={{ r: isMobile ? 4 : 6 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Goals */}
      {goals.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Active Goals</CardTitle>
            <CardDescription>Your short-term weight goals</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {goals.map((goal) => {
                const deadlineDate = new Date(goal.deadline);
                const now = new Date();
                const isAchieved =
                  goal.status === "achieved" ||
                  (latestWeight != null && latestWeight <= goal.target_weight_kg);
                const daysRemaining = Math.max(
                  0,
                  differenceInDays(deadlineDate, now)
                );
                const weeksRemaining = Math.max(daysRemaining / 7, 0.01);
                const kgToLose =
                  latestWeight != null
                    ? latestWeight - goal.target_weight_kg
                    : goal.target_weight_kg;
                const kgPerWeek = kgToLose / weeksRemaining;
                const isAmbitious = kgPerWeek > 1;

                return (
                  <li
                    key={goal.id}
                    className="flex flex-col gap-2 rounded-lg border border-(--border) p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-(--accent)" />
                        <span className="text-lg font-semibold">
                          {goal.target_weight_kg} kg
                        </span>
                        {isAchieved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-sm font-medium text-emerald-500">
                            <Trophy className="h-4 w-4" />
                            Goal Achieved!
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-(--muted-foreground)">
                          Deadline: {format(deadlineDate, "PP")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteGoalTarget(goal)}
                          className="text-red-400 hover:bg-red-500/20 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span>
                        Days remaining:{" "}
                        <strong>
                          {isAchieved ? 0 : daysRemaining}
                        </strong>
                      </span>
                      {!isAchieved && latestWeight != null && (
                        <>
                          <span>
                            Realism:{" "}
                            <strong>
                              {(kgPerWeek).toFixed(2)} kg/week
                            </strong>
                          </span>
                          {isAmbitious && (
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setAmbitiousPopoverGoalId(
                                    ambitiousPopoverGoalId === goal.id ? null : goal.id
                                  )
                                }
                                className="flex cursor-pointer items-center gap-1 text-amber-500 hover:text-amber-600"
                              >
                                <AlertTriangle className="h-4 w-4" />
                                Ambitious
                              </button>
                              {ambitiousPopoverGoalId === goal.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setAmbitiousPopoverGoalId(null)}
                                    aria-hidden
                                  />
                                  <div className="absolute left-0 top-full z-50 mt-1 w-[250px] rounded-lg border border-(--border) bg-(--card) p-3 shadow-lg">
                                    <p className="text-sm text-foreground">
                                      Health experts typically recommend losing 0.5–1 kg per week.
                                      Losing more than 1 kg/week can be difficult to sustain and
                                      may not be healthy.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => setAmbitiousPopoverGoalId(null)}
                                      className="mt-2 text-xs font-medium text-(--accent) hover:underline"
                                    >
                                      Close
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Delete goal confirmation modal */}
      {deleteGoalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDeleteGoalTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-(--border) bg-(--card) p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Delete goal?</h3>
            <p className="mt-2 text-(--muted-foreground)">
              Are you sure you want to delete this goal?
            </p>
            <p className="mt-1 font-medium">
              {deleteGoalTarget.target_weight_kg} kg — {format(new Date(deleteGoalTarget.deadline), "PP")}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteGoalTarget(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => handleDeleteGoal(deleteGoalTarget.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-(--border) bg-(--card) p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Delete weight entry?</h3>
            <p className="mt-2 text-(--muted-foreground)">
              Are you sure you want to delete this input?
            </p>
            <p className="mt-1 font-medium">
              {deleteTarget.weight_kg} kg — {format(new Date(deleteTarget.created_at ?? ""), "PP")}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => handleDelete(deleteTarget.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Past weight entries</CardDescription>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="py-8 text-center text-(--muted-foreground)">
              No measurements yet. Add your first weight above!
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {visibleMeasurements.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-(--border) p-3"
                  >
                    <div>
                      <span className="font-semibold">{m.weight_kg} kg</span>
                      <span className="ml-2 text-sm text-(--muted-foreground)">
                        {format(new Date(m.created_at ?? ""), "PP")}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(m)}
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
