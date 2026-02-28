import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  const { data: measurements } = await supabase
    .from("measurements")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: quotes } = await supabase
    .from("quotes")
    .select("*");

  const quote = quotes && quotes.length > 0
    ? quotes[Math.floor(Math.random() * quotes.length)]
    : null;

  return (
    <DashboardClient
      profile={profile}
      measurements={measurements ?? []}
      quote={quote}
    />
  );
}
