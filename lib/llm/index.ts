import { trace } from "@opentelemetry/api";
import { assertUnderSpendCap, recordCost } from "./cost";
import { computeCostUsd, routing, type JobKind } from "./routing";

/**
 * Provider abstraction (§15). `chat` routes a job to its configured provider,
 * meters cost into the `costs` table, and traces every call. No streaming
 * here — the streaming synthesis path (P6) layers on top.
 */

export interface ChatOptions {
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  workspaceId?: string | null;
}

export interface ChatResult {
  text: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const tracer = trace.getTracer("commonplace-llm");

async function groqChat(
  model: string,
  opts: ChatOptions,
): Promise<Omit<ChatResult, "costUsd" | "provider">> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const messages = [
    ...(opts.system ? [{ role: "system", content: opts.system }] : []),
    { role: "user", content: opts.prompt },
  ];

  const attempts = 4;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= attempts) {
        throw new Error(`Groq ${res.status} after ${attempts} attempts`);
      }
      const retryAfter = Number(res.headers.get("retry-after") ?? 0);
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 2000;
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: data.choices[0]?.message.content ?? "",
      model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }
}

async function ollamaChat(
  model: string,
  opts: ChatOptions,
): Promise<Omit<ChatResult, "costUsd" | "provider">> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      options: { temperature: opts.temperature ?? 0.3 },
      ...(opts.json ? { format: "json" } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    message: { content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  return {
    text: data.message.content,
    model,
    inputTokens: data.prompt_eval_count ?? 0,
    outputTokens: data.eval_count ?? 0,
  };
}

export async function chat(job: JobKind, opts: ChatOptions): Promise<ChatResult> {
  const route = routing[job];
  return await tracer.startActiveSpan(`llm.${job}`, async (span) => {
    try {
      if (route.provider === "groq") await assertUnderSpendCap();
      const raw =
        route.provider === "groq"
          ? await groqChat(route.model, opts)
          : await ollamaChat(route.model, opts);
      const costUsd = computeCostUsd(raw.model, raw.inputTokens, raw.outputTokens);
      span.setAttributes({
        "llm.provider": route.provider,
        "llm.model": raw.model,
        "llm.input_tokens": raw.inputTokens,
        "llm.output_tokens": raw.outputTokens,
        "llm.cost_usd": costUsd,
      });
      await recordCost({
        workspaceId: opts.workspaceId,
        job,
        provider: route.provider,
        model: raw.model,
        inputTokens: raw.inputTokens,
        outputTokens: raw.outputTokens,
        costUsd,
      });
      return { ...raw, provider: route.provider, costUsd };
    } finally {
      span.end();
    }
  });
}

/** Embeddings via Ollama. Returns null when Ollama isn't reachable. */
export async function embed(texts: string[]): Promise<number[][] | null> {
  const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
  const model = routing.embed.model;
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  } catch {
    return null;
  }
}

/** Fill a pack prompt template: replaces each {{name}} with its value. */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  );
}
