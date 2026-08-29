import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { StickerSheet } from "./StickerSheet";

export const dynamic = "force-dynamic";

export default async function WeightRoomStickersPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/stickers");
  }
  return <StickerSheet />;
}
