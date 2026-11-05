import { SampleEditor } from "./SampleEditor";

export const dynamic = "force-dynamic";

export default async function SampleAdjustPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    return (
      <p className="p-8 text-sm text-foreground-muted">
        Sample adjustments are only on the local server.
      </p>
    );
  }
  const { id } = await params;
  return <SampleEditor batteryId={id} />;
}
