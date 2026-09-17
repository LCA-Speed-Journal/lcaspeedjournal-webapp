import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ManualLogClient } from "./ManualLogClient";

export const dynamic = "force-dynamic";

export default async function WeightRoomManualLogPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/log");
  }
  return <ManualLogClient />;
}
