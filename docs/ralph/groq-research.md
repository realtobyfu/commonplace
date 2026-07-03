# Groq Platform Research — for Commonplace LLM Job Routing

**Retrieved on:** 2026-07-02
**Purpose:** Evaluate Groq as the paid-tier LLM provider (replacing the Anthropic API) for Commonplace, keeping Ollama for free local jobs. Covers model catalog, pricing, rate limits, prompt caching, OpenAI compatibility, and embeddings availability.

**Method note:** All data below was pulled live from `console.groq.com/docs/*` and `groq.com/pricing` via web fetch/search on the retrieval date. Where the live pages disagreed with each other or with third-party sources, I re-verified against the most authoritative page (`console.groq.com`) and flagged remaining uncertainty as **UNVERIFIED**. One important correction versus initial data: `groq.com/pricing` still lists `moonshotai/kimi-k2-instruct-0905` in its prompt-caching table, but `console.groq.com/docs/deprecations` confirms this model was **shut down on 2026-04-15** — i.e., it is gone as of today. The pricing page appears to have stale/cached content. Kimi K2 is therefore excluded from the live catalog below.

---

## 1. Current Production Model Catalog

Source: [console.groq.com/docs/models](https://console.groq.com/docs/models), cross-checked against [groq.com/pricing](https://groq.com/pricing) and individual model pages.

### Production models (stable, SLA-backed)

| Model ID | Developer | Context Window | Max Completion | Input $/MTok | Output $/MTok | Notes |
|---|---|---|---|---|---|---|
| `llama-3.1-8b-instant` | Meta | 131,072 | 131,072 | $0.05 | $0.08 | Small/fast Llama-class, cheapest text model |
| `llama-3.3-70b-versatile` | Meta | 131,072 | 32,768 | $0.59 | $0.79 | Large Llama-class, general purpose |
| `openai/gpt-oss-120b` | OpenAI | 131,072 | 65,536 | $0.15 | $0.60 | Flagship open-weight reasoning MoE (120B total params); supports prompt caching, browser search, code execution tools |
| `openai/gpt-oss-20b` | OpenAI | 131,072 | 65,536 | $0.075 | $0.30 | Smaller reasoning/agentic MoE; supports prompt caching |
| `groq/compound` | Groq (system) | 131,072 | — | see note | see note | Agentic system with built-in web search + code execution; priced via underlying model + tool-call fees |
| `groq/compound-mini` | Groq (system) | 131,072 | 8,192 | see note | see note | Lighter compound system |
| `whisper-large-v3` | OpenAI | — | — | $0.111/hr audio | — | Speech-to-text |
| `whisper-large-v3-turbo` | OpenAI | — | — | $0.04/hr audio | — | Faster/cheaper speech-to-text |

### Preview models (eval-only, may be discontinued at short notice)

| Model ID | Developer | Context Window | Input $/MTok | Output $/MTok | Notes |
|---|---|---|---|---|---|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Meta | 131,072 | $0.11 | $0.34 | Natively multimodal MoE (17B active / 16 experts) |
| `qwen/qwen3-32b` | Alibaba Cloud | 131,072 | $0.29 | $0.59 | Dense reasoning model |
| `qwen/qwen3.6-27b` | Alibaba Cloud | 131,072 | $0.60 | $3.00 | Newer Qwen preview; notably pricier output than GPT-OSS-120B — **UNVERIFIED** whether this is a typo on Groq's pricing page since it undercuts nothing and overprices a 27B model above a 120B one; treat with caution and re-check before committing to it |
| `openai/gpt-oss-safeguard-20b` | OpenAI | 131,072 | $0.075 | $0.30 | Safety/moderation-tuned variant of GPT-OSS-20B; supports prompt caching |
| `meta-llama/llama-prompt-guard-2-22m` | Meta | 512 | — | — | Prompt-injection classifier, not a generation model |
| `meta-llama/llama-prompt-guard-2-86m` | Meta | 512 | — | — | Prompt-injection classifier, not a generation model |
| `canopylabs/orpheus-v1-english` | Canopy Labs | 4,000 | $22/M chars | — | Text-to-speech |
| `canopylabs/orpheus-arabic-saudi` | Canopy Labs | 4,000 | $40/M chars | — | Text-to-speech |

### REMOVED from catalog — do not use

| Model ID | Status |
|---|---|
| `moonshotai/kimi-k2-instruct` | Shut down **2025-10-10**, replacement: `openai/gpt-oss-120b` |
| `moonshotai/kimi-k2-instruct-0905` | Shut down **2026-04-15**, replacement: `openai/gpt-oss-120b` |

**Enterprise-only (contact sales, no self-serve pricing):** Minimax M2.5, Qwen3-VL 32B — **UNVERIFIED** pricing, mentioned only on the pricing page with no numbers.

Sources: [console.groq.com/docs/models](https://console.groq.com/docs/models), [console.groq.com/docs/deprecations](https://console.groq.com/docs/deprecations), [groq.com/pricing](https://groq.com/pricing)

---

## 2. Rate Limits — Free vs. Developer (paid) tier

Source: [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits)

### Free tier (fully verified, live table)

| Model | RPM | RPD | TPM | TPD |
|---|---|---|---|---|
| `llama-3.1-8b-instant` | 30 | 14.4K | 6K | 500K |
| `llama-3.3-70b-versatile` | 30 | 1K | 12K | 100K |
| `openai/gpt-oss-120b` | 30 | 1K | 8K | 200K |
| `openai/gpt-oss-20b` | 30 | 1K | 8K | 200K |
| `openai/gpt-oss-safeguard-20b` | 30 | 1K | 8K | 200K |
| `meta-llama/llama-4-scout-17b-16e-instruct` | 30 | 1K | 30K | 500K |
| `qwen/qwen3-32b` | 60 | 1K | 6K | 500K |
| `qwen/qwen3.6-27b` | 30 | 1K | 8K | 200K |
| `groq/compound` | 30 | 250 | 70K | — |
| `groq/compound-mini` | 30 | 250 | 70K | — |
| `whisper-large-v3` | 20 | 2K | — | — |
| `whisper-large-v3-turbo` | 20 | 2K | — | — |

### Developer (paid) tier

The live rate-limits page **only publishes the Free plan table**; it states verbatim: *"Upgrade to Developer plan to access higher limits, Batch and Flex processing, and more"* but does not enumerate exact Developer-tier RPM/TPM numbers per model on that page.

**UNVERIFIED (third-party sourced, not confirmed on an official Groq page):** multiple secondary sources (tokenmix.ai, eesel.ai, klymentiev.com blogs) report Developer-tier figures such as ~1,000 RPM and 250,000–300,000 TPM for most production models, and llama-3.1-8b-instant scaling to 500,000 RPD. These numbers could not be confirmed against a live first-party Groq page during this research pass and should be re-verified in the Groq Console dashboard (limits are account-specific and visible after adding a payment method) before being used for capacity planning.

### Billing model — confirmed pay-as-you-go, no subscription

Per Groq's own docs and console flow: adding a payment method moves an account from Free to Developer/pay-as-you-go tier automatically — **there is no monthly subscription fee**, you are billed only for tokens/tools consumed. This is consistent across the pricing page and rate-limit docs' framing of "Developer plan" as an unlock triggered by billing setup rather than a subscription tier. Treat the "no subscription" characterization as **confirmed directionally**, but the exact mechanics (e.g., whether there's a minimum spend or auto top-up requirement) are **UNVERIFIED** — worth confirming in the billing/account settings UI directly since docs pages didn't show a dedicated billing-terms page (a `/docs/pricing` URL returned 404).

Sources: [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits), [groq.com/pricing](https://groq.com/pricing)

---

## 3. Prompt Caching

Source: [console.groq.com/docs/prompt-caching](https://console.groq.com/docs/prompt-caching)

| Property | Value |
|---|---|
| Activation | **Automatic/implicit** — no cache-control markers, no code changes, no extra fee to enable |
| Supported models | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b` only |
| Discount | 50% off input token price for cached portions |
| Minimum prefix length | Varies by model, 128–1024 tokens |
| Cache lifetime | Auto-expires after 2 hours of inactivity (volatile, not persistent) |
| Guarantee | **Not guaranteed** — works via prefix-matching against recent requests; a cache hit is probabilistic, not assured |
| Rate limit interaction | Cached tokens do **not** count against TPM/TPD limits |

Confirmed per-model cached pricing (from pricing page prompt-caching table):

| Model | Uncached input $/MTok | Cached input $/MTok | Output $/MTok |
|---|---|---|---|
| `openai/gpt-oss-120b` | $0.15 | $0.075 | $0.60 |
| `openai/gpt-oss-20b` | $0.075 | $0.0375 | $0.30 |

**Implication for Commonplace's ~80K-token stable-prefix synthesis job:** caching only applies to GPT-OSS models, is not guaranteed, and expires after 2 hours idle — so a low-traffic prefix (e.g., a single user's context reused sparingly) may frequently miss cache and pay full price. This is a materially weaker caching story than Anthropic's explicit `cache_control` breakpoints with guaranteed hits and longer TTL options. Plan for the no-cache-hit cost as the realistic baseline and treat cache savings as a bonus, not a guarantee.

Sources: [console.groq.com/docs/prompt-caching](https://console.groq.com/docs/prompt-caching), [groq.com/pricing](https://groq.com/pricing)

---

## 4. OpenAI Compatibility

Source: [console.groq.com/docs/openai](https://console.groq.com/docs/openai), [console.groq.com/docs/structured-outputs](https://console.groq.com/docs/structured-outputs), [console.groq.com/docs/text-chat](https://console.groq.com/docs/text-chat)

| Property | Value |
|---|---|
| Base URL | `https://api.groq.com/openai/v1` |
| Client | Official OpenAI SDKs work by pointing `base_url` at the above; Groq also has native Python/TypeScript SDKs |
| Streaming | Fully supported (`stream=True`), standard SSE delta format |
| Stop sequences | Fully supported, single string or array |
| Unsupported chat params | `logprobs`, `top_logprobs`, `logit_bias`, `messages[].name`; `n` must be 1 if supplied |
| Temperature quirk | `temperature=0` is silently converted to `1e-8` server-side — not a hard error, but not literally greedy either |
| JSON Object mode | Supported on **all** models (basic `response_format: {type: "json_object"}`, prompt-guided, not schema-validated) |
| JSON Schema strict mode | Only on `openai/gpt-oss-120b` and `openai/gpt-oss-20b` (`strict: true`) — requires all fields `required` and `additionalProperties: false` |
| JSON Schema best-effort mode | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `openai/gpt-oss-safeguard-20b`, `meta-llama/llama-4-scout-17b-16e-instruct` |
| Critical limitation | **Structured Outputs (schema mode) do not support streaming or tool use simultaneously** — if Commonplace's routing-decision job needs strict JSON *and* streaming, it can't have both on Groq |
| Audio unsupported formats | `vtt`, `srt` output formats for transcription |

**Implication for job (b), per-message routing decisions outputting strict JSON:** use `openai/gpt-oss-20b` (cheap, fast) with `response_format` JSON Schema in best-effort or strict mode, non-streaming. `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` are **not** in the structured-outputs-supported list, so if strict JSON schema enforcement is required, they're off the table for that job — fall back to JSON Object mode (unenforced) with retry/validation logic, or route to a GPT-OSS model instead.

---

## 5. Embeddings — Not offered

Source: [console.groq.com/docs/api-reference](https://console.groq.com/docs/api-reference)

**Groq does not have an embeddings endpoint.** The full first-party API reference lists only: Chat (chat completions), Responses (beta), Audio (transcription/translation/speech), Models, Batches, Files, Fine Tuning. There is no `/embeddings` route anywhere in the reference, and no embeddings model appears in the model catalog.

This confirms the project's existing plan: **use Ollama locally for all embedding generation.** Groq is text-generation/audio only.

---

## 6. Batch API (relevant for the corpus-ingestion cost estimate)

Source: [console.groq.com/docs/batch](https://console.groq.com/docs/batch)

| Property | Value |
|---|---|
| Discount | 50% off standard synchronous pricing |
| Processing window | 24 hours to 7 days (user-selectable; longer window = more likely to complete under load) |
| Supported chat models | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `meta-llama/llama-4-scout-17b-16e-instruct`, `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, Llama Guard 4 12B |
| Supported audio models | `whisper-large-v3`, `whisper-large-v3-turbo` |
| Rate-limit interaction | Batch jobs run outside standard sync rate limits — ideal for large one-shot ingestion jobs like initial corpus summarization |

**This matters directly for job (a):** a one-time full-corpus ingestion of ~2.3M tokens is exactly the batch-appropriate workload — non-interactive, latency-insensitive, and large enough that the 50% discount is worth the 24hr+ turnaround.

---

## 7. Recommendation: Job → Model Mapping

| Job | Recommended model | Why | Structured output / caching fit |
|---|---|---|---|
| (a) High-volume passage summarization (1–3 sentence summaries) | `llama-3.1-8b-instant` via **Batch API** | Cheapest model ($0.05/$0.08 per MTok), task doesn't need reasoning depth, batch discount stacks on top of already-low price, non-interactive workload matches batch's 24hr+ window | No caching benefit needed (short, one-off passages); batch = 50% off |
| (b) Per-message routing decisions, strict JSON | `openai/gpt-oss-20b`, synchronous, non-streaming, JSON Schema (best-effort or strict) | Only small-ish model with structured-output schema support; cheap ($0.075/$0.30); low latency needed since it's per-message/interactive | Structured outputs supported (streaming must be off); prompt caching available if the routing prompt has a large stable instruction prefix |
| (c) Answer synthesis over long assembled context (~80K token stable prefix) | `openai/gpt-oss-120b`, synchronous | Largest reasoning-capable model available now that Kimi K2 is deprecated; 131K context comfortably covers 80K prefix + question + output; only large model with prompt-caching support, so the stable prefix has a shot at the 50% cached-input discount on repeat calls within 2 hours | Prompt caching applies (not guaranteed — treat savings as upside); structured outputs also available here if synthesis needs schema’d output |
| (d) Concept-card synthesis (quality matters) | `openai/gpt-oss-120b`, synchronous (fallback: `llama-3.3-70b-versatile` if GPT-OSS-120B underperforms on this task in eval) | With Kimi K2 gone, GPT-OSS-120B is Groq's flagship reasoning model and Groq's own docs name it as the direct replacement for Kimi K2 workloads; Llama 3.3 70B is the next-best large Llama-class option if a second opinion / different model family is wanted for quality comparison | No caching needed unless concept cards share a long stable prefix across cards |

### Cost estimate: one full corpus ingestion (~2.3M input / ~0.4M output tokens for summaries + cards)

Assume the bulk of the 2.3M input tokens is job (a) (passage summarization, batched on `llama-3.1-8b-instant`), and the 0.4M output tokens split between short summaries (a) and higher-quality concept cards (d) on `openai/gpt-oss-120b`. Two scenarios below — adjust the split once real job proportions are known.

**Scenario: ~2.0M input / ~0.3M output on (a) llama-3.1-8b-instant [Batch, 50% off]; ~0.3M input / ~0.1M output on (d) openai/gpt-oss-120b [sync, no cache hit assumed]**

| Component | Tokens | Rate (after batch discount where applicable) | Cost |
|---|---|---|---|
| (a) input, batch | 2.0M | $0.025/MTok (50% of $0.05) | $0.05 |
| (a) output, batch | 0.3M | $0.04/MTok (50% of $0.08) | $0.012 |
| (d) input, sync, GPT-OSS-120B | 0.3M | $0.15/MTok | $0.045 |
| (d) output, sync, GPT-OSS-120B | 0.1M | $0.60/MTok | $0.06 |
| **Total** | | | **≈ $0.17** |

This is an illustrative split, not a measured one — **UNVERIFIED against actual Commonplace corpus job-type proportions**, but it demonstrates the order of magnitude: a full 2.3M/0.4M-token corpus ingestion on Groq costs well under $1, even without heavy optimization, because the batch discount on the cheap 8B model dominates the token volume.

### Per-conversation-turn cost: routing + synthesis

Assume: routing decision (b) is small (~500 input / ~50 output tokens of JSON), synthesis (c) has an 80K-token stable prefix (assume cache miss, worst case) plus ~2K new question tokens and ~1K output tokens.

| Component | Tokens | Model | Rate | Cost |
|---|---|---|---|---|
| (b) routing input | 500 | gpt-oss-20b | $0.075/MTok | $0.0000375 |
| (b) routing output | 50 | gpt-oss-20b | $0.30/MTok | $0.000015 |
| (c) synthesis input, cache MISS (worst case) | 82,000 | gpt-oss-120b | $0.15/MTok | $0.0123 |
| (c) synthesis input, cache HIT on 80K prefix (best case) | 80K cached @ $0.075 + 2K uncached @ $0.15 | gpt-oss-120b | mixed | $0.006 + $0.0003 = $0.0063 |
| (c) synthesis output | 1,000 | gpt-oss-120b | $0.60/MTok | $0.0006 |
| **Total per turn (cache miss / worst case)** | | | | **≈ $0.013** |
| **Total per turn (cache hit / best case)** | | | | **≈ $0.007** |

At this rate, 1,000 conversation turns cost roughly **$7–13** depending on cache hit rate — cheap enough that the main design lever is UX latency (Groq's inference speed, hundreds of tokens/sec) rather than cost.

---

## Summary of UNVERIFIED items (re-check before relying on them)

1. **Developer-tier exact RPM/TPM/TPD numbers per model** — not published on a live first-party page found during this research; only Free-tier table is public. Third-party blog estimates (~1,000 RPM, ~250-300K TPM) are unconfirmed against an official source.
2. **`qwen/qwen3.6-27b` pricing** ($0.60 input / $3.00 output) looks anomalous (pricier than the much larger gpt-oss-120b) — could be a pricing-page error; re-verify before using this model for any cost-sensitive job.
3. **Exact billing mechanics of Free → Developer transition** (minimum spend, auto-reload requirements) — docs confirm "pay-as-you-go, no subscription" directionally, but a dedicated billing-terms page could not be located (`/docs/pricing` returned 404).
4. **Enterprise-only model pricing** (Minimax M2.5, Qwen3-VL 32B) — no public numbers, sales-gated.
5. **`groq/compound` / `groq/compound-mini` exact pricing** — priced through underlying model + tool-call fees, not a flat per-token rate; not fully itemized in this pass.
6. **Cost estimate splits in Section 7** are illustrative based on the total token budget given in the task prompt, not measured from actual Commonplace job telemetry.
