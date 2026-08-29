import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPreviewCatalog } from "@/lib/weight-room/preview-items";
import { PreviewGallery } from "./PreviewGallery";

export const dynamic = "force-dynamic";

export default async function WeightRoomPreviewPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/weight-room/preview");
  }
  const items = getPreviewCatalog();
  return <PreviewGallery items={items} />;
}
