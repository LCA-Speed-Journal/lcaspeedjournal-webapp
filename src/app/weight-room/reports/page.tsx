import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function WeightRoomReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/reports");
  }
  return <ReportsClient />;
}
