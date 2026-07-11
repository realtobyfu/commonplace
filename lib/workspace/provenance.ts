/**
 * Provenance markers (§11 steps 3–4). The synthesis prompt instructs the
 * model to append [[p:PASSAGE_ID]] after grounded claims. Verified live
 * against gpt-oss-120b: it reliably wraps the id in double brackets but
 * regularly drops the literal "p:" prefix ([[UUID]] instead of
 * [[p:UUID]]) — the "p:" is optional here so both forms strip cleanly
 * rather than leaking raw brackets into the answer and silently losing
 * every citation.
 */

const MARKER_RE = /\[\[(?:p:)?([0-9a-f-]{36})\]\]/gi;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Defensive second pass: the model improvises citation shapes that still
// leak brackets into the prose. Seen live from gpt-oss-120b: ASCII
// short-ordinal ([[p:11]]), fullwidth brackets with an ordinal (【p:30】),
// and single-closing-bracket-plus-section shapes ([[p:UUID]§0],
// [[UUID]§12]). Any "[[…" attempt — with or without the p: prefix —
// followed by up to 60 non-bracket chars, one or two closing brackets and
// an optional §N segment is removed. The character class can't cross a
// bracket, so the pass can't greedily eat surrounding prose; it runs AFTER
// the well-formed MARKER_RE pass so real [[p:UUID]] citations are always
// captured first.
const MALFORMED_MARKER_RE =
  /\[\[(?:p:)?[^[\]]{1,60}\](?:§\d+)?\]?|【\s*p:[^】]{0,40}】/gi;

export interface StrippedProvenance {
  clean: string;
  passageIds: string[];
}

export function stripProvenanceMarkers(text: string): StrippedProvenance {
  const passageIds: string[] = [];
  const seen = new Set<string>();
  const clean = text
    .replace(MARKER_RE, (_match, id: string) => {
      const lower = id.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        passageIds.push(lower);
      }
      return "";
    })
    .replace(MALFORMED_MARKER_RE, (match) => {
      // A malformed shape can still smuggle a real citation ([[UUID]§12]):
      // rescue the full UUID so the botched brackets don't cost the reader
      // the source chip. Truncated/ordinal ids simply strip.
      const uuid = match.match(UUID_RE);
      if (uuid) {
        const lower = uuid[0].toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          passageIds.push(lower);
        }
      }
      return "";
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1") // marker removal can orphan a space
    .replace(/,\s*(?=[.,;:!?]|$)/g, "") // or an orphaned separator comma (multiple citations were comma-joined)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { clean, passageIds };
}

/**
 * Router output parsing (§11 step 1). The router must return strict JSON;
 * models still wrap it in prose or fences often enough that we extract the
 * first JSON object/array before parsing. Returns [] on anything malformed —
 * the loop treats that as "no card coverage" and falls back to retrieval.
 */
export interface RouterPick {
  type: "card" | "work";
  id: string;
}

export function parseRouterPicks(raw: string): RouterPick[] {
  const start = raw.search(/[[{]/);
  if (start === -1) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, findJsonEnd(raw, start) + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>).items ?? []);
  if (!Array.isArray(list)) return [];
  return list.filter(
    (p): p is RouterPick =>
      typeof p === "object" &&
      p !== null &&
      ((p as RouterPick).type === "card" || (p as RouterPick).type === "work") &&
      typeof (p as RouterPick).id === "string",
  );
}

/** Index of the matching close bracket for the JSON value opening at `start`. */
function findJsonEnd(raw: string, start: number): number {
  const open = raw[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return raw.length - 1;
}
