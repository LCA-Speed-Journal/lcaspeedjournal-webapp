import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { AttendanceClient } from "./AttendanceClient";

export const dynamic = "force-dynamic";

export default async function WeightRoomAttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/attendance");
  }
  return <AttendanceClient />;
}
