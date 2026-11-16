import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BatteryBoard } from "./BatteryBoard";

export const dynamic = "force-dynamic";

export default async function BatteryBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const [{ id }, query, session] = await Promise.all([
    params,
    searchParams,
    getServerSession(authOptions),
  ]);
  const initialSample = process.env.NODE_ENV === "development" && query.sample !== "0";
  return <BatteryBoard batteryId={id} initialSample={initialSample} coach={session != null} />;
}
