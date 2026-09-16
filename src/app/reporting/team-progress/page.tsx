import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TeamProgressClient from "./TeamProgressClient";

export default async function TeamProgressPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/reporting/team-progress");
  }
  return <TeamProgressClient />;
}
