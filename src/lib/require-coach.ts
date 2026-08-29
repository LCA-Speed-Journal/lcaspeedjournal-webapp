import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type CoachSessionOk = { ok: true };
export type CoachSessionErr = { ok: false; status: 401; error: string };

export async function requireCoachSession(): Promise<CoachSessionOk | CoachSessionErr> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
