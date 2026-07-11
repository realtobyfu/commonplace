import Link from "next/link";
import { loadHome, type HomePack } from "@/lib/workspace/home";
import { NewWorkspaceButton } from "@/components/home/NewWorkspaceButton";

/**
 * The front door, set as a book's front matter: a title page, then each
 * pack as a table of contents — workspaces are the entries, leader dots
 * run out to their marginalia (message count, working-memory load, date).
 * The § ornament is the same glyph the workspace uses for passage
 * ordinals; verdigris appears only where it means "in memory" (§13.5).
 * A pack with nothing read yet is an invitation, not an error.
 */

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** A contents entry: question, dotted leader, marginalia. */
function WorkspaceRow({ ws }: { ws: HomePack["workspaces"][number] }) {
  return (
    <li>
      <Link
        href={`/w/${ws.id}`}
        className="group flex items-baseline gap-1 py-2.5"
      >
        <span
          className={`min-w-0 shrink truncate font-corpus text-[16px] ${
            ws.firstQuestion
              ? "text-ink group-hover:text-verdigris-deep"
              : "text-ink-faint italic"
          }`}
        >
          {ws.firstQuestion ?? "Nothing asked yet — open it and ask"}
        </span>
        <span
          aria-hidden="true"
          className="mx-2 min-w-8 flex-1 self-center border-b border-dotted border-structure-strong"
        />
        <span className="flex shrink-0 items-baseline gap-3 font-mono text-[11px] text-ink-faint">
          {ws.messageCount > 0 && <span>{ws.messageCount} messages</span>}
          {ws.memoryCount > 0 && (
            <span className="text-verdigris">{ws.memoryCount} in memory</span>
          )}
          <span>{formatDate(ws.createdAt)}</span>
        </span>
      </Link>
    </li>
  );
}

function PackSection({ pack }: { pack: HomePack }) {
  const ingested = pack.ingestedWorks > 0;
  return (
    <section aria-label={pack.name}>
      <div className="flex items-baseline justify-between gap-6 border-b-2 border-ink/80 pb-2.5">
        <h2 className="text-[14px] font-semibold tracking-[0.1em] text-ink uppercase">
          {pack.name}
        </h2>
        {/* Collation line — the shelf described the way a bibliography
            would describe a volume. */}
        <p className="hidden font-mono text-[11px] text-ink-muted sm:block">
          {ingested ? (
            <>
              {pack.ingestedWorks} {pack.workLabel.toLowerCase()}s ·{" "}
              {pack.passages.toLocaleString()} passages
              {pack.conceptCards > 0 && <> · {pack.conceptCards} concept cards</>}
            </>
          ) : (
            "nothing read yet"
          )}
        </p>
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-8">
        <p className="max-w-[52ch] font-corpus text-[15px] leading-snug text-ink-muted italic">
          {pack.promiseLine}
        </p>
        <span className="shrink-0 whitespace-nowrap">
          <NewWorkspaceButton packId={pack.id} ingested={ingested} />
        </span>
      </div>

      {pack.workspaces.length > 0 && (
        <ul className="mt-4">
          {pack.workspaces.map((ws) => (
            <WorkspaceRow key={ws.id} ws={ws} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Home() {
  const packs = await loadHome();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-8 pt-24 pb-12">
      {/* Title page — centered the way front matter is, even though the
          workspace itself reads left-to-right like any working page. */}
      <header className="flex flex-col items-center text-center">
        <p className="font-mono text-[11px] font-medium tracking-[0.22em] text-ink-muted uppercase">
          Commonplace
        </p>
        <div
          aria-hidden="true"
          className="mt-7 flex w-44 items-center gap-3 text-ink-faint"
        >
          <span className="h-px flex-1 bg-structure-strong" />
          <span className="font-corpus text-[15px]">§</span>
          <span className="h-px flex-1 bg-structure-strong" />
        </div>
        <h1 className="mt-7 font-corpus text-[52px] leading-[1.12] font-normal text-ink">
          A commonplace book
          <br />
          that <em className="pr-1">reads</em> for you.
        </h1>
        <p className="mt-6 max-w-[44ch] text-[14px] leading-relaxed text-ink-muted">
          Pick a shelf below. The model reads all of it, then answers with a
          working memory you can watch: what it holds, what it lets go, and
          why.
        </p>
      </header>

      <div className="mt-20 flex flex-col gap-16">
        {packs.map((pack) => (
          <PackSection key={pack.id} pack={pack} />
        ))}
      </div>

      {/* Colophon. */}
      <footer className="mt-auto pt-20 text-center">
        <p
          aria-hidden="true"
          className="font-corpus text-[13px] text-ink-faint"
        >
          §
        </p>
        <p className="mt-3 font-mono text-[10.5px] tracking-[0.02em] text-ink-faint">
          Set in Newsreader, Inter &amp; JetBrains Mono · public-domain and
          openly licensed sources · every answer cites its passages
        </p>
      </footer>
    </main>
  );
}
