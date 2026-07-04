"use client";

import { useCallback, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace/state";
import { Conversation, type ChatMessage } from "./Conversation";
import { MemoryPanel } from "./MemoryPanel";
import { Shelf } from "./Shelf";

/**
 * The three-surface workspace (§13.1). Client-side owner of live state:
 * consumes the one SSE wire from POST /api/w/:id/messages and fans events
 * out — answer_delta to the conversation, memory_op to the panel feed —
 * then re-syncs the working set from the server when the turn ends.
 */

interface WorkspaceShellProps {
  state: WorkspaceState;
  workLabel: string;
}

interface SseFrame {
  type: string;
  [key: string]: unknown;
}

function parseSseChunk(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const dataLine = part.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    try {
      frames.push(JSON.parse(dataLine.slice(5).trim()) as SseFrame);
    } catch {
      // partial frame — ignore
    }
  }
  return { frames, rest };
}

export function WorkspaceShell({ state, workLabel }: WorkspaceShellProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    state.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      provenance: m.provenance,
      streaming: false,
    })),
  );
  const [workingSet, setWorkingSet] = useState(state.workingSet);
  const [budget, setBudget] = useState(state.budget);
  const [recentOps, setRecentOps] = useState(state.recentOps);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshState = useCallback(async () => {
    const res = await fetch(`/api/w/${state.workspace.id}/state`).catch(() => null);
    if (!res?.ok) return;
    const fresh = (await res.json()) as WorkspaceState;
    setWorkingSet(fresh.workingSet);
    setBudget(fresh.budget);
    setRecentOps(fresh.recentOps);
  }, [state.workspace.id]);

  const send = useCallback(
    async (text: string) => {
      if (busy) return;
      setBusy(true);
      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: text,
        provenance: [],
        streaming: false,
      };
      const draftId = `draft-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: draftId, role: "assistant", content: "", provenance: [], streaming: true },
      ]);

      try {
        const res = await fetch(`/api/w/${state.workspace.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const frame of frames) {
            if (frame.type === "status") {
              setStatusLine(String(frame.message ?? ""));
            } else if (frame.type === "memory_op") {
              setRecentOps((prev) =>
                [
                  {
                    op: String(frame.op),
                    reason: String(frame.reason),
                    createdAt: new Date().toISOString(),
                  },
                  ...prev,
                ].slice(0, 6),
              );
            } else if (frame.type === "answer_delta") {
              setStatusLine(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === draftId
                    ? { ...m, content: m.content + String(frame.text ?? "") }
                    : m,
                ),
              );
            } else if (frame.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === draftId
                    ? {
                        ...m,
                        id: String(frame.messageId ?? draftId),
                        provenance: (frame.provenance ?? []) as ChatMessage["provenance"],
                        streaming: false,
                      }
                    : m,
                ),
              );
            } else if (frame.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === draftId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `Something interrupted the answer: ${String(frame.message ?? "unknown")}`,
                        streaming: false,
                      }
                    : m,
                ),
              );
            }
          }
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === draftId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `The answer never arrived — ${err instanceof Error ? err.message : "connection lost"}.`,
                  streaming: false,
                }
              : m,
          ),
        );
      } finally {
        setStatusLine(null);
        setBusy(false);
        void refreshState();
      }
    },
    [busy, refreshState, state.workspace.id],
  );

  const memoryOp = useCallback(
    async (op: "pin" | "unpin" | "evict" | "hydrate", itemType: string, itemId: string) => {
      await fetch(`/api/w/${state.workspace.id}/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, itemType, itemId }),
      }).catch(() => undefined);
      void refreshState();
    },
    [refreshState, state.workspace.id],
  );

  return (
    <div className="flex h-screen min-w-[1024px]">
      <Shelf works={state.shelf} workLabel={workLabel} />
      <Conversation
        promiseLine={state.workspace.promiseLine}
        starterPrompts={state.workspace.starterPrompts}
        messages={messages}
        ingestionDone={state.ingestion.done}
        statusLine={statusLine}
        busy={busy}
        onSend={send}
      />
      <MemoryPanel
        cards={workingSet.map((i) => ({
          id: i.itemId,
          itemType: i.itemType,
          title: i.title,
          state: i.pinned ? "pinned" : (i.state as "hydrated" | "compressed"),
          passageCount: i.passageCount,
          tokenCost: i.tokenCost,
        }))}
        budget={budget}
        recentOps={recentOps}
        onOp={memoryOp}
      />
    </div>
  );
}
