import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { RostersClient } from "./RostersClient";

export const dynamic = "force-dynamic";

export default async function WeightRoomRostersPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/rosters");
  }
  return <RostersClient />;
}
