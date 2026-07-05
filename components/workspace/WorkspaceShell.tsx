"use client";

import { useCallback, useRef, useState } from "react";
import type { WorkspaceState } from "@/lib/workspace/state";
import type { WorkspaceSettings } from "@/lib/workspace/settings";
import { ActivityTimeline } from "./ActivityTimeline";
import { Conversation, type ChatMessage, type PendingInterrupt } from "./Conversation";
import { MemoryPanel } from "./MemoryPanel";
import { PassageOverlay, type PassageDetail } from "./PassageOverlay";
import { SettingsDrawer } from "./SettingsDrawer";
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
  const [settings, setSettings] = useState<WorkspaceSettings>(state.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [pendingInterrupt, setPendingInterrupt] = useState<PendingInterrupt | null>(null);
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [openPassage, setOpenPassage] = useState<PassageDetail | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshState = useCallback(async () => {
    const res = await fetch(`/api/w/${state.workspace.id}/state`).catch(() => null);
    if (!res?.ok) return;
    const fresh = (await res.json()) as WorkspaceState;
    setWorkingSet(fresh.workingSet);
    setBudget(fresh.budget);
    setRecentOps(fresh.recentOps);
  }, [state.workspace.id]);

  /**
   * §11 step 2: the panel animates while the answer streams. memory_op
   * frames arrive in a burst before the first answer_delta; a short debounce
   * coalesces them into one working-set refresh so cards unfold/condense
   * mid-stream instead of at turn end.
   */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void refreshState();
    }, 150);
  }, [refreshState]);

  const send = useCallback(
    async (text: string, opts: { approveLargeLoads?: boolean } = {}) => {
      if (busy) return;
      setBusy(true);
      setPendingInterrupt(null);
      const approving = opts.approveLargeLoads === true;

      // On the initial send, optimistically show the user's message; on an
      // approval re-send the user bubble is already on screen, so only add a
      // fresh streaming draft.
      const userMsgId = `local-${Date.now()}`;
      const draftId = `draft-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        ...(approving
          ? []
          : [
              {
                id: userMsgId,
                role: "user",
                content: text,
                provenance: [],
                streaming: false,
              } as ChatMessage,
            ]),
        { id: draftId, role: "assistant", content: "", provenance: [], streaming: true },
      ]);

      try {
        const res = await fetch(`/api/w/${state.workspace.id}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: text, approveLargeLoads: approving }),
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
            if (frame.type === "interrupt") {
              // H5 pause-and-ask: nothing was persisted. Drop the empty
              // draft and surface a confirm affordance referencing this
              // same question, which the user can approve or cancel.
              setStatusLine(null);
              setMessages((prev) => prev.filter((m) => m.id !== draftId));
              setPendingInterrupt({
                text,
                userMsgId,
                label: String(frame.label ?? "a large load"),
                itemCount: Number(frame.itemCount ?? 1),
                incomingTokens: Number(frame.incomingTokens ?? 0),
              });
            } else if (frame.type === "status") {
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
              scheduleRefresh(); // cards unfold/condense while the answer streams
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
              // Replace the raw streamed accumulation with the server's
              // cleaned text — provenance markers are stripped only once
              // the full answer is in, so the live stream still contains
              // them until this frame arrives.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === draftId
                    ? {
                        ...m,
                        id: String(frame.messageId ?? draftId),
                        content: String(frame.content ?? m.content),
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
    [busy, refreshState, scheduleRefresh, state.workspace.id],
  );

  /**
   * §13.3: clicking a provenance chip opens the passage and flashes its
   * parent card in the panel (when one of the citing cards is in memory).
   */
  const openChip = useCallback(
    async (passageId: string) => {
      const res = await fetch(`/api/passages/${passageId}`).catch(() => null);
      if (!res?.ok) return;
      const detail = (await res.json()) as PassageDetail;
      setOpenPassage(detail);
      const inMemory = workingSet.find(
        (i) =>
          (i.itemType === "card" && detail.cardIds.includes(i.itemId)) ||
          (i.itemType === "passage" && i.itemId === passageId),
      );
      if (inMemory) {
        setFlashItemId(inMemory.itemId);
        setTimeout(() => setFlashItemId(null), 1600);
      }
    },
    [workingSet],
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

  const approveInterrupt = useCallback(() => {
    if (!pendingInterrupt) return;
    void send(pendingInterrupt.text, { approveLargeLoads: true });
  }, [pendingInterrupt, send]);

  const cancelInterrupt = useCallback(() => {
    if (!pendingInterrupt) return;
    const userMsgId = pendingInterrupt.userMsgId;
    setMessages((prev) => prev.filter((m) => m.id !== userMsgId));
    setPendingInterrupt(null);
  }, [pendingInterrupt]);

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
        pendingInterrupt={pendingInterrupt}
        onApproveInterrupt={approveInterrupt}
        onCancelInterrupt={cancelInterrupt}
        onChipClick={openChip}
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
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenTimeline={() => setTimelineOpen(true)}
        flashItemId={flashItemId}
      />
      {settingsOpen && (
        <SettingsDrawerHost
          workspaceId={state.workspace.id}
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => {
            setSettings(s);
            setBudget((b) => ({ ...b, total: s.tokenBudget }));
          }}
        />
      )}
      {timelineOpen && (
        <div className="fixed top-0 right-0 z-20 h-screen w-[340px] border-l border-structure-strong">
          <ActivityTimeline
            workspaceId={state.workspace.id}
            onClose={() => setTimelineOpen(false)}
          />
        </div>
      )}
      {openPassage && (
        <PassageOverlay passage={openPassage} onClose={() => setOpenPassage(null)} />
      )}
    </div>
  );
}

/**
 * The drawer overlays the memory panel; it's rendered as a fixed panel on the
 * right so it sits above the panel column without needing to thread props
 * through MemoryPanel's internals.
 */
function SettingsDrawerHost({
  workspaceId,
  settings,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  settings: WorkspaceSettings;
  onClose: () => void;
  onSaved: (s: WorkspaceSettings) => void;
}) {
  return (
    <div className="fixed top-0 right-0 z-20 h-screen w-[340px] border-l border-structure-strong">
      <SettingsDrawer
        workspaceId={workspaceId}
        settings={settings}
        onClose={onClose}
        onSaved={onSaved}
      />
    </div>
  );
}
