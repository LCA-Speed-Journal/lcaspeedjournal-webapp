import { BatteryBoard } from "./BatteryBoard";

export const dynamic = "force-dynamic";

export default async function BatteryBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sample?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const initialSample = process.env.NODE_ENV === "development" && query.sample !== "0";
  return <BatteryBoard batteryId={id} initialSample={initialSample} />;
}
