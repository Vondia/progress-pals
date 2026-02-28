"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Scale, Ruler, Calendar, User, Target } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [heightCm, setHeightCm] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const height = Number(heightCm);
    if (isNaN(height) || height < 50 || height > 300) {
      setError("Height must be between 50 and 300 cm");
      setLoading(false);
      return;
    }

    const targetWeight = Number(targetWeightKg);
    if (isNaN(targetWeight) || targetWeight < 20 || targetWeight > 300) {
      setError("Target weight must be between 20 and 300 kg");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      height_cm: height,
      target_weight_kg: targetWeight,
      birthdate,
      gender: gender || "prefer_not_to_say",
    });

    setLoading(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <Scale className="h-8 w-8 text-(--accent)" />
        <span className="text-2xl font-bold">Progress Pals</span>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">Complete your profile</CardTitle>
          <CardDescription>
            Help us personalize your weight-tracking experience
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/20 p-3 text-sm text-red-400">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="height_cm">Height (cm)</Label>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted-foreground)" />
                <Input
                  id="height_cm"
                  type="number"
                  placeholder="170"
                  min={50}
                  max={300}
                  step={1}
                  className="pl-10"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target_weight_kg">Target weight (kg)</Label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted-foreground)" />
                <Input
                  id="target_weight_kg"
                  type="number"
                  placeholder="75"
                  min={20}
                  max={300}
                  step={0.1}
                  className="pl-10"
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthdate">Birthdate</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted-foreground)" />
                <Input
                  id="birthdate"
                  type="date"
                  className="pl-10"
                  value={birthdate}
                  onChange={(e) => setBirthdate(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gender">Gender</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--muted-foreground)" />
                <select
                  id="gender"
                  className="flex h-10 w-full appearance-none rounded-lg border border-(--border) bg-(--muted)/50 pl-10 pr-8 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? "Saving…" : "Get started"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
