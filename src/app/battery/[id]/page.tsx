import { BatteryBoard } from "./BatteryBoard";

export const dynamic = "force-dynamic";

export default async function BatteryBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatteryBoard batteryId={id} />;
}
