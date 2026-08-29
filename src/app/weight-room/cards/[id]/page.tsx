import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CardEditor } from "./CardEditor";

export const dynamic = "force-dynamic";

export default async function WeightRoomCardEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  if (!session) {
    redirect(`/login?callbackUrl=/weight-room/cards/${id}`);
  }
  return <CardEditor templateId={id} />;
}
