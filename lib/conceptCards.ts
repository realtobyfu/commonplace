/** A candidate passage used while building or hydrating a concept card. */
export type CardMatch = {
  passageId: string;
  summary: string;
  author: string;
  work: string;
  weight: number;
};

/**
 * Preserve high-relevance candidates while round-robining works. A card that
 * only repeats one work is a poor orientation aid even when its embeddings
 * happen to be very similar.
 */
export function chooseDiverseCardMatches<T extends CardMatch>(matches: T[], cap = 16): T[] {
  const byWork = new Map<string, T[]>();
  for (const match of matches) {
    const key = `${match.author}\u0000${match.work}`;
    const list = byWork.get(key) ?? [];
    list.push(match);
    byWork.set(key, list);
  }
  const selected: T[] = [];
  while (selected.length < cap) {
    let added = false;
    for (const entries of byWork.values()) {
      const next = entries.shift();
      if (!next) continue;
      selected.push(next);
      added = true;
      if (selected.length === cap) break;
    }
    if (!added) break;
  }
  return selected;
}
