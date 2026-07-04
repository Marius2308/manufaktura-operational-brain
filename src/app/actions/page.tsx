import { getActions } from "@/lib/queries";
import { getLocations } from "@/lib/db";
import { ActionsBoard } from "@/components/ActionsBoard";

export const dynamic = "force-dynamic";

export default function ActionsPage() {
  const actions = getActions();
  const locations = getLocations();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Action tracker</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Every recommended action across all locations — assign an owner and deadline, track status, and record
          whether it worked in the follow-up note.
        </p>
      </div>
      <ActionsBoard actions={actions} locations={locations} />
    </div>
  );
}
