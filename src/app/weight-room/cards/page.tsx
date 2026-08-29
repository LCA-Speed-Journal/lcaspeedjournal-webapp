import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CardsIndex } from "./CardsIndex";

export const dynamic = "force-dynamic";

export default async function WeightRoomCardsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/cards");
  }
  return <CardsIndex />;
}
