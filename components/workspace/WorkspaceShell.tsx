"use client";

import { useRouter } from "next/navigation";
import type { ShelfWork, WorkspaceState } from "@/lib/workspace/state";
import { Conversation } from "./Conversation";
import { MemoryPanel } from "./MemoryPanel";
import { Shelf } from "./Shelf";

/**
 * The three-surface workspace (§13.1): shelf, conversation, memory panel —
 * one screen, min 1024px. This is the client-side composition; the page
 * component does the server-side data fetch and pack lookup.
 */

interface WorkspaceShellProps {
  state: WorkspaceState;
  workLabel: string;
}

export function WorkspaceShell({ state, workLabel }: WorkspaceShellProps) {
  const router = useRouter();

  const shelf: ShelfWork[] = state.shelf;

  const send = async (text: string) => {
    await fetch(`/api/w/${state.workspace.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
    }).catch(() => undefined);
    router.refresh();
  };

  return (
    <div className="flex h-screen min-w-[1024px]">
      <Shelf works={shelf} workLabel={workLabel} />
      <Conversation
        promiseLine={state.workspace.promiseLine}
        starterPrompts={state.workspace.starterPrompts}
        messages={state.messages}
        ingestionDone={state.ingestion.done}
        onSend={send}
      />
      <MemoryPanel cards={[]} budget={state.budget} recentOps={state.recentOps} />
    </div>
  );
}
