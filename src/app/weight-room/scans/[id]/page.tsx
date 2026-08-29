import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ReviewClient } from "./ReviewClient";

export const dynamic = "force-dynamic";

export default async function WeightRoomScanReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  if (!session) {
    redirect(`/login?callbackUrl=/weight-room/scans/${id}`);
  }
  return <ReviewClient scanId={id} />;
}
