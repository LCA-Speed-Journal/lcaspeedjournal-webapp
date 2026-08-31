import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TestingDayClient from "./TestingDayClient";

export const dynamic = "force-dynamic";

export default async function TestingDayPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/reporting/testing-day");
  }

  return <TestingDayClient />;
}
