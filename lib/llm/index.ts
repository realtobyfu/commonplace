import { trace } from "@opentelemetry/api";
import { assertUnderSpendCap, recordCost } from "./cost";
import { computeCostUsd, isReasoningModel, routing, type JobKind } from "./routing";

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
        // GPT-OSS models reason before answering; without this, Groq mixes
        // raw thinking tokens into the visible content (verified live —
        // answers came back full of "wait, let me pick a different
        // passage..." scratchpad text). Hidden keeps only the final answer.
        // Only sent for reasoning models: Llama-family models 400 on it.
        ...(isReasoningModel(model) ? { reasoning_format: "hidden" } : {}),
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

export interface StreamHandle {
  /** Async iterator of text deltas. */
  deltas: AsyncGenerator<string, void, unknown>;
  /** Resolves after the stream ends, with final usage + metered cost. */
  result: Promise<ChatResult>;
}

/**
 * Streaming chat for the synthesis job (§11 step 3). Groq only — the
 * synthesis route is Groq per H4, and Ollama never streams in this app.
 * Cost is metered from the terminal usage chunk, same table as chat().
 */
export async function chatStream(
  job: JobKind,
  opts: ChatOptions,
): Promise<StreamHandle> {
  const route = routing[job];
  if (route.provider !== "groq") {
    throw new Error(`chatStream only supports groq routes (job: ${job})`);
  }
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  await assertUnderSpendCap();

  const span = tracer.startSpan(`llm.${job}.stream`);
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: route.model,
      messages: [
        ...(opts.system ? [{ role: "system", content: opts.system }] : []),
        { role: "user", content: opts.prompt },
      ],
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.4,
      ...(isReasoningModel(route.model) ? { reasoning_format: "hidden" } : {}), // see groqChat
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!res.ok || !res.body) {
    span.end();
    throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  let resolveResult!: (r: ChatResult) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<ChatResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const body = res.body;
  async function* deltas(): AsyncGenerator<string, void, unknown> {
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for await (const chunk of body) {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.replace(/^data: ?/, "").trim();
          if (!data || data === "[DONE]" || !line.startsWith("data:")) continue;
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
            x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
          };
          const usage = parsed.usage ?? parsed.x_groq?.usage;
          if (usage) {
            inputTokens = usage.prompt_tokens ?? inputTokens;
            outputTokens = usage.completion_tokens ?? outputTokens;
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
      const costUsd = computeCostUsd(route.model, inputTokens, outputTokens);
      span.setAttributes({
        "llm.provider": "groq",
        "llm.model": route.model,
        "llm.input_tokens": inputTokens,
        "llm.output_tokens": outputTokens,
        "llm.cost_usd": costUsd,
      });
      await recordCost({
        workspaceId: opts.workspaceId,
        job,
        provider: "groq",
        model: route.model,
        inputTokens,
        outputTokens,
        costUsd,
      });
      resolveResult({
        text: "",
        model: route.model,
        provider: "groq",
        inputTokens,
        outputTokens,
        costUsd,
      });
    } catch (err) {
      rejectResult(err);
      throw err;
    } finally {
      span.end();
    }
  }

  return { deltas: deltas(), result };
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
