import { philosophyPack } from "./philosophy/pack";
import { swiftEvolutionPack } from "./swift-evolution/pack";
import type { DomainPack } from "./types";

export const packs: Record<string, DomainPack> = {
  [philosophyPack.id]: philosophyPack,
  [swiftEvolutionPack.id]: swiftEvolutionPack,
};

export function getPack(packId: string): DomainPack {
  const pack = packs[packId];
  if (!pack) throw new Error(`Unknown domain pack: ${packId}`);
  return pack;
}
