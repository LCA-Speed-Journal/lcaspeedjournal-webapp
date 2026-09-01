import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NormsEditor } from "./NormsEditor";

export const dynamic = "force-dynamic";

export default async function NormsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/norms");
  }

  return <NormsEditor />;
}
