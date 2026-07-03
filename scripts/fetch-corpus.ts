/**
 * Downloads the public-domain corpus from Project Gutenberg, strips PG
 * headers/footers, normalizes whitespace, and writes:
 *   corpus/{author}/{work-slug}.txt
 *   corpus/manifest.json  (title, author, translator, gutenberg id, license,
 *                          word count — the source of truth for ingestion and
 *                          the README license table)
 *
 * Source list comes from corpus-research.json (verified IDs + verdicts).
 * Only INCLUDE verdicts are fetched; EXCLUDE entries are carried into the
 * manifest as exclusions so the README can explain what's missing and why.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface ResearchWork {
  author: string;
  title: string;
  translator: string;
  gutenbergId: number | null;
  plaintextUrl: string | null;
  licenseBasis: string;
  verdict: "INCLUDE" | "EXCLUDE" | "SUBSTITUTE";
  notes: string;
  allVolumeIds?: Record<string, number>;
}

interface Research {
  verifiedAt: string;
  works: ResearchWork[];
}

interface ManifestWork {
  author: string;
  authorDisplay: string;
  title: string;
  translator: string;
  gutenbergId: number;
  sourceUrl: string;
  licenseNote: string;
  wordCount: number;
  file: string;
  substitution?: string;
}

interface ManifestExclusion {
  author: string;
  title: string;
  reason: string;
}

const AUTHOR_DISPLAY: Record<string, string> = {
  plato: "Plato",
  nietzsche: "Friedrich Nietzsche",
  kant: "Immanuel Kant",
  schopenhauer: "Arthur Schopenhauer",
  hegel: "G. W. F. Hegel",
  kierkegaard: "Søren Kierkegaard",
  rousseau: "Jean-Jacques Rousseau",
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip the Gutenberg header/footer using the standard *** START/END markers. */
function stripGutenbergBoilerplate(raw: string, title: string): string {
  const startMatch = raw.match(/\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  // Older PG files end with "End of Project Gutenberg's <title>" instead of
  // the *** END *** marker; cut at whichever appears first.
  const endMatch = raw.match(
    /\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*|^End of (?:the )?Project Gutenberg/im,
  );
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`No Gutenberg START marker found in "${title}"`);
  }
  const start = startMatch.index + startMatch[0].length;
  const end = endMatch?.index ?? raw.length;
  return raw.slice(start, end);
}

function normalizeWhitespace(text: string): string {
  return (
    text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+$/gm, "")
      // collapse runs of 3+ blank lines to 2 (paragraph break stays visible)
      .replace(/\n{4,}/g, "\n\n\n")
      .trim() + "\n"
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

async function fetchPlaintext(url: string): Promise<string> {
  // gutenberg.org can take >10s just to accept the connection; retry
  // rather than raising undici's fixed connect timeout.
  const attempts = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "commonplace-corpus-fetch (personal project)" },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await res.text();
    } catch (err) {
      if (attempt >= attempts) throw err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

/** Expand research entries into one fetch job per Gutenberg ebook. */
function expandJobs(research: Research) {
  const jobs: Array<{
    author: string;
    title: string;
    translator: string;
    gutenbergId: number;
    url: string;
    licenseNote: string;
    substitution?: string;
  }> = [];
  const exclusions: ManifestExclusion[] = [];

  for (const work of research.works) {
    if (work.verdict === "EXCLUDE") {
      exclusions.push({
        author: work.author,
        title: work.title,
        reason: work.licenseBasis,
      });
      continue;
    }
    if (work.allVolumeIds) {
      for (const [volumeTitle, id] of Object.entries(work.allVolumeIds)) {
        if (volumeTitle.includes("duplicate")) continue;
        jobs.push({
          author: work.author,
          title: volumeTitle,
          translator: work.translator,
          gutenbergId: id,
          url: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
          licenseNote: work.licenseBasis,
        });
      }
      continue;
    }
    if (work.gutenbergId === null || work.plaintextUrl === null) {
      throw new Error(`INCLUDE verdict but no id/url for "${work.title}"`);
    }
    jobs.push({
      author: work.author,
      title: work.title,
      translator: work.translator,
      gutenbergId: work.gutenbergId,
      url: work.plaintextUrl,
      licenseNote: work.licenseBasis,
      ...(work.verdict === "SUBSTITUTE" ? { substitution: work.notes } : {}),
    });
  }
  return { jobs, exclusions };
}

async function main() {
  const root = path.join(import.meta.dirname ?? __dirname, "..");
  const research: Research = JSON.parse(
    await readFile(path.join(root, "corpus-research.json"), "utf8"),
  );
  // later scope amendments (Hegel substitutes, Rousseau) live in a second file
  try {
    const additions: Research = JSON.parse(
      await readFile(path.join(root, "corpus-research-additions.json"), "utf8"),
    );
    research.works.push(...additions.works);
  } catch {
    // no additions file — the original research list stands alone
  }
  const { jobs, exclusions } = expandJobs(research);

  const manifestWorks: ManifestWork[] = [];
  for (const job of jobs) {
    const slug = slugify(job.title);
    const dir = path.join(root, "corpus", job.author);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${slug}.txt`);

    process.stdout.write(`Fetching ${job.author}/${slug} (#${job.gutenbergId})… `);
    const raw = await fetchPlaintext(job.url);
    const text = normalizeWhitespace(stripGutenbergBoilerplate(raw, job.title));
    await writeFile(file, text);
    const wordCount = countWords(text);
    console.log(`${wordCount.toLocaleString()} words`);

    manifestWorks.push({
      author: job.author,
      authorDisplay: AUTHOR_DISPLAY[job.author] ?? job.author,
      title: job.title,
      translator: job.translator,
      gutenbergId: job.gutenbergId,
      sourceUrl: job.url,
      licenseNote: job.licenseNote,
      wordCount,
      file: path.relative(root, file),
      ...(job.substitution ? { substitution: job.substitution } : {}),
    });

    // be polite to Gutenberg
    await new Promise((r) => setTimeout(r, 1500));
  }

  const manifest = {
    fetchedAt: new Date().toISOString(),
    researchVerifiedAt: research.verifiedAt,
    works: manifestWorks,
    exclusions,
    totalWords: manifestWorks.reduce((sum, w) => sum + w.wordCount, 0),
  };
  await writeFile(
    path.join(root, "corpus", "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(
    `\n${manifestWorks.length} works, ${manifest.totalWords.toLocaleString()} words total. ` +
      `${exclusions.length} exclusions recorded in corpus/manifest.json.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
