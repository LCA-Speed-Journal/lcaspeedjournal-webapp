import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ExtracurricularClient } from "./ExtracurricularClient";

export const dynamic = "force-dynamic";

export default async function ExtracurricularStrengthPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/extracurricular");
  }
  return <ExtracurricularClient />;
}
