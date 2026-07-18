export interface SourceSpec {
  author: string; // slug, e.g. "plato"
  authorDisplay: string; // "Plato"
  title: string; // "The Republic"
  translator: string;
  gutenbergId: number;
  plaintextUrl: string;
  licenseNote: string; // license basis shown in the README corpus table
}

export type ChunkingStrategy = "dialogue" | "aphorism" | "treatise";

export interface ChunkingRules {
  strategy: ChunkingStrategy;
  targetTokens: number; // soft target per passage
  maxTokens: number; // soft cap
  overlapParagraphs?: number; // treatise-style overlap
  skipHeadings?: string[]; // regex sources; matching sections are front matter, never chunked
}

export interface ChunkingSpec {
  default: ChunkingRules;
  perAuthor?: Record<string, ChunkingRules>; // keyed by author slug
}

export interface DomainPack {
  id: string; // "philosophy"
  name: string; // "Philosophy Canon"
  promiseLine: string; // the empty-state positioning sentence
  sources: SourceSpec[];
  chunking: ChunkingSpec;
  vocabulary: {
    authorLabel: string; // "Thinker" | "Author" | "Proposal author"
    workLabel: string; // "Work" | "Proposal"
  };
  prompts: {
    summarizePassage: string; // template — {{passage}}, {{author}}, {{work}}
    summarizeWorkOrientation: string; // template — {{summaries}}, {{author}}, {{work}}
    synthesizeCard: string; // template — {{concept}}, {{summaries}}
    answerSystem: string; // workspace conversation system prompt
    starterPromptGen: string; // emits starter prompts at end of ingestion
  };
  conceptSeeds?: string[]; // concepts to bias card synthesis toward
}
