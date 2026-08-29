import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ScansInbox } from "./ScansInbox";

export const dynamic = "force-dynamic";

export default async function WeightRoomScansPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/scans");
  }
  return <ScansInbox />;
}
