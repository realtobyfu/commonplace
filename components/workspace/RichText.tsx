"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Lightweight markdown renderer for model-authored prose (§13.3). Answers,
 * card summaries, and starter prompts arrive as a markdown subset —
 * **bold**, *italic* / _italic_, `code`, ###/## headings, ordered and
 * unordered lists, > quotes — which was previously shown raw. No external
 * dependency: the subset is small and the corpus voice depends on
 * controlling exactly how each piece renders.
 *
 * Citation tokens ([[p:UUID]] and the malformed shapes the model
 * improvises, e.g. "[[p:UUID]§0]" or "【p:30】") are lifted out of the
 * prose. When `renderCitation` is provided and the token carries a full
 * UUID, an inline chip is rendered at the citation site; otherwise the
 * token is hidden. A trailing half-typed token during streaming is hidden
 * until it completes.
 */

interface RichTextProps {
  text: string;
  /** Inline chip for a resolvable citation; return null to drop it. */
  renderCitation?: (passageId: string, key: string) => ReactNode;
  className?: string;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Any bracketed citation attempt, well-formed or not:
//   [[p:UUID]]  [[UUID]]  [[p:UUID]§0]  [[p:11]]  【p:30】
const CITE_TOKEN_RE =
  /\[\[(?:p:)?[^[\]]{1,60}\](?:§\d+)?\]|【\s*p:[^】]{0,40}】/gi;

// A token still being streamed: an unclosed "[[…" at end of text.
const PARTIAL_CITE_RE = /\[\[[^\]]{0,60}$|【[^】]{0,40}$/;

type InlineNode =
  | { kind: "text"; value: string }
  | { kind: "bold"; children: InlineNode[] }
  | { kind: "italic"; children: InlineNode[] }
  | { kind: "code"; value: string }
  | { kind: "cite"; passageId: string };

/** Split inline markdown into nodes. Handles `code` first (its contents are
 *  verbatim), then **bold**, then *italic* / _italic_. */
function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  // Tokenize code spans and citations first — neither nests.
  const parts = text.split(/(`[^`]+`)/g);
  for (const part of parts) {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      nodes.push({ kind: "code", value: part.slice(1, -1) });
      continue;
    }
    let rest = part;
    CITE_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let cursor = 0;
    const segs: InlineNode[] = [];
    while ((m = CITE_TOKEN_RE.exec(rest)) !== null) {
      if (m.index > cursor) segs.push(...parseEmphasis(rest.slice(cursor, m.index)));
      const uuid = m[0].match(UUID_RE);
      if (uuid) segs.push({ kind: "cite", passageId: uuid[0].toLowerCase() });
      cursor = m.index + m[0].length;
    }
    if (cursor < rest.length) {
      rest = rest.slice(cursor);
      // Hide a half-streamed trailing token.
      const partial = rest.match(PARTIAL_CITE_RE);
      if (partial) rest = rest.slice(0, partial.index);
      segs.push(...parseEmphasis(rest));
    }
    nodes.push(...segs);
  }
  return nodes;
}

function parseEmphasis(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      nodes.push({ kind: "bold", children: parseItalic(part.slice(2, -2)) });
    } else {
      nodes.push(...parseItalic(part));
    }
  }
  return nodes;
}

function parseItalic(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const parts = text.split(/(\*[^*\s][^*]*\*|\b_[^_]+_\b)/g);
  for (const part of parts) {
    if (
      part.length > 2 &&
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_")))
    ) {
      nodes.push({ kind: "italic", children: [{ kind: "text", value: part.slice(1, -1) }] });
    } else if (part) {
      nodes.push({ kind: "text", value: part });
    }
  }
  return nodes;
}

function InlineNodes({
  nodes,
  renderCitation,
  keyPrefix,
}: {
  nodes: InlineNode[];
  renderCitation?: RichTextProps["renderCitation"];
  keyPrefix: string;
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${keyPrefix}-${i}`;
        switch (n.kind) {
          case "text":
            return <Fragment key={key}>{n.value}</Fragment>;
          case "bold":
            return (
              <strong key={key} className="font-semibold">
                <InlineNodes nodes={n.children} renderCitation={renderCitation} keyPrefix={key} />
              </strong>
            );
          case "italic":
            return (
              <em key={key} className="font-corpus">
                <InlineNodes nodes={n.children} renderCitation={renderCitation} keyPrefix={key} />
              </em>
            );
          case "code":
            return (
              <code
                key={key}
                className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-[0.85em]"
              >
                {n.value}
              </code>
            );
          case "cite":
            return renderCitation ? (
              <Fragment key={key}>{renderCitation(n.passageId, key)}</Fragment>
            ) : null;
        }
      })}
    </>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; depth: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "ol"; start: number; items: string[] }
  | { kind: "ul"; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join("\n") });
      para = [];
    }
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const olItem = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    const ulItem = line.match(/^\s*[-•*]\s+(.*)$/);
    const quote = line.match(/^>\s?(.*)$/);
    // noUncheckedIndexedAccess: the groups are structurally guaranteed by
    // each regex (no optional groups), so default to "" rather than assert.
    if (heading) {
      flush();
      blocks.push({
        kind: "h",
        depth: (heading[1] ?? "#").length,
        text: heading[2] ?? "",
      });
    } else if (olItem) {
      flush();
      const item = olItem[2] ?? "";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ol") last.items.push(item);
      else blocks.push({ kind: "ol", start: Number(olItem[1]), items: [item] });
    } else if (ulItem) {
      flush();
      const item = ulItem[1] ?? "";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else if (quote) {
      flush();
      const quoted = quote[1] ?? "";
      const last = blocks[blocks.length - 1];
      if (last?.kind === "quote") last.text += `\n${quoted}`;
      else blocks.push({ kind: "quote", text: quoted });
    } else if (line.trim() === "") {
      flush();
    } else {
      // Continuation of the previous list item (wrapped line)?
      const last = blocks[blocks.length - 1];
      if (para.length === 0 && (last?.kind === "ol" || last?.kind === "ul")) {
        last.items[last.items.length - 1] += ` ${line.trim()}`;
      } else {
        para.push(line);
      }
    }
  }
  flush();
  return blocks;
}

export function RichText({ text, renderCitation, className }: RichTextProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return (
              <p
                key={i}
                className="mt-5 mb-2 font-ui text-[13px] font-semibold tracking-[0.02em] text-ink first:mt-0"
              >
                <InlineNodes nodes={parseInline(b.text)} renderCitation={renderCitation} keyPrefix={`h${i}`} />
              </p>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="my-3 border-l-2 border-verdigris/40 pl-4 text-ink-muted italic"
              >
                <InlineNodes nodes={parseInline(b.text)} renderCitation={renderCitation} keyPrefix={`q${i}`} />
              </blockquote>
            );
          case "ol":
            return (
              <ol
                key={i}
                start={b.start}
                className="my-3 list-decimal space-y-2 pl-6 marker:font-mono marker:text-[0.8em] marker:text-verdigris"
              >
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineNodes nodes={parseInline(item)} renderCitation={renderCitation} keyPrefix={`o${i}-${j}`} />
                  </li>
                ))}
              </ol>
            );
          case "ul":
            return (
              <ul
                key={i}
                className="my-3 list-disc space-y-2 pl-6 marker:text-verdigris/70"
              >
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineNodes nodes={parseInline(item)} renderCitation={renderCitation} keyPrefix={`u${i}-${j}`} />
                  </li>
                ))}
              </ul>
            );
          case "p":
            return (
              <p key={i} className="my-3 whitespace-pre-wrap first:mt-0 last:mb-0">
                <InlineNodes nodes={parseInline(b.text)} renderCitation={renderCitation} keyPrefix={`p${i}`} />
              </p>
            );
        }
      })}
    </div>
  );
}
