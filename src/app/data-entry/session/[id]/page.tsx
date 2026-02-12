import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PageBackground } from "@/app/components/PageBackground";
import { DataEntryLayout } from "../../DataEntryLayout";
import { EditSessionClient } from "./EditSessionClient";

export const dynamic = "force-dynamic";

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login?callbackUrl=/data-entry");
  }

  const { id } = await params;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageBackground />
      <DataEntryLayout
        sidebar={<EditSessionSidebar sessionId={id} />}
        main={<EditSessionClient sessionId={id} />}
      />
    </div>
  );
}

function EditSessionSidebar({ sessionId }: { sessionId: string }) {
  return (
    <div className="space-y-4">
      <Link
        href="/data-entry"
        className="text-sm text-accent hover:text-accent-hover"
      >
        ← Back to data entry
      </Link>
      <p className="text-xs text-foreground-muted">
        Editing session {sessionId.slice(0, 8)}…
      </p>
    </div>
  );
}
