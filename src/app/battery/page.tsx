import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageBackground } from "@/app/components/PageBackground";
import { BatteryBrowser } from "./BatteryBrowser";

export const dynamic = "force-dynamic";

export default async function BatteryIndexPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageBackground />
      <BatteryBrowser canCreate={Boolean(session)} />
    </div>
  );
}
