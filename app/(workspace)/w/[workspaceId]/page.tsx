import { notFound } from "next/navigation";
import { getPack } from "@/domain-packs";
import { loadWorkspaceState } from "@/lib/workspace/state";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const state = await loadWorkspaceState(workspaceId);
  if (!state) notFound();

  const pack = getPack(state.workspace.packId);

  return <WorkspaceShell state={state} workLabel={pack.vocabulary.workLabel} />;
}
