import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { IntakeClient } from "./IntakeClient";

export const dynamic = "force-dynamic";

export default async function CohortIntakePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/cohort/intake");
  }
  return <IntakeClient />;
}
