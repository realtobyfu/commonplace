/**
 * Chunk-preview CLI (§17 P2):
 *   pnpm chunks --work republic --sample 10
 *
 * Fuzzy-matches --work against corpus/manifest.json, chunks the cleaned text
 * with the pack's per-author rules, prints distribution stats and a sample of
 * passages. This output is what HUMAN GATE H1 reviews.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { philosophyPack } from "../domain-packs/philosophy/pack";
import { chunkWork } from "../lib/chunking";

interface ManifestWork {
  author: string;
  title: string;
  file: string;
  wordCount: number;
}

async function main() {
  const { values } = parseArgs({
    options: {
      work: { type: "string" },
      sample: { type: "string", default: "10" },
    },
  });
  if (!values.work) {
    console.error("usage: pnpm chunks --work <name> [--sample N]");
    process.exit(1);
  }

  const root = path.join(import.meta.dirname ?? __dirname, "..");
  const manifest = JSON.parse(
    await readFile(path.join(root, "corpus", "manifest.json"), "utf8"),
  ) as { works: ManifestWork[] };

  const needle = values.work.toLowerCase();
  const work = manifest.works.find((w) =>
    w.title.toLowerCase().includes(needle) || w.file.includes(needle),
  );
  if (!work) {
    console.error(`No work matching "${values.work}" in corpus/manifest.json`);
    process.exit(1);
  }

  const rules =
    philosophyPack.chunking.perAuthor?.[work.author] ??
    philosophyPack.chunking.default;
  const source = await readFile(path.join(root, work.file), "utf8");
  const passages = chunkWork(source, rules);

  const tokens = passages.map((p) => p.tokenCount).sort((a, b) => a - b);
  const sum = tokens.reduce((s, t) => s + t, 0);
  const pct = (q: number) => tokens[Math.floor(q * (tokens.length - 1))];

  console.log(`# ${work.title} (${work.author}) — strategy: ${rules.strategy}`);
  console.log(
    `${passages.length} passages | tokens min ${tokens[0]} / p50 ${pct(0.5)} / p90 ${pct(0.9)} / max ${tokens[tokens.length - 1]} | mean ${Math.round(sum / tokens.length)}`,
  );

  const sampleSize = Number(values.sample);
  const step = Math.max(1, Math.floor(passages.length / sampleSize));
  for (let i = 0; i < passages.length && i / step < sampleSize; i += step) {
    const p = passages[i];
    if (!p) continue;
    console.log(
      `\n─── passage ${p.ordinal} · ${p.tokenCount} tokens · ${p.heading ?? "(no heading)"} ───`,
    );
    const preview =
      p.text.length > 600 ? `${p.text.slice(0, 600)} […]` : p.text;
    console.log(preview);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
