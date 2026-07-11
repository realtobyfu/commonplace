"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The front door's one action: open a fresh workspace on a pack. POSTs
 * /api/workspaces; a pack that still needs ingestion routes through the
 * reading screen (/ingest), an already-read pack drops straight into the
 * workspace.
 */
export function NewWorkspaceButton({
  packId,
  ingested,
}: {
  packId: string;
  ingested: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      if (!res.ok) throw new Error(`create failed: ${res.status}`);
      const data = (await res.json()) as {
        workspace: { id: string };
        ingestJobId: string | null;
      };
      router.push(
        data.ingestJobId
          ? `/ingest/${data.workspace.id}`
          : `/w/${data.workspace.id}`,
      );
    } catch {
      setCreating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={create}
      disabled={creating}
      className={ingested ? "btn-secondary" : "btn-primary"}
    >
      {creating
        ? "Opening…"
        : ingested
          ? "New workspace"
          : "Read this corpus"}
    </button>
  );
}
