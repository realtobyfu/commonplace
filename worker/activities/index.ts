export async function greet(name: string): Promise<string> {
  return `Hello, ${name} — the shelf is ready.`;
}

export {
  chunkWorkActivity,
  embedWork,
  finishWork,
  generateStarterPrompts,
  preparePack,
  summarizeBatch,
  summarizeWorkOrientation,
  synthesizeConceptCards,
} from "./ingest";
