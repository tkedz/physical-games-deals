/**
 * The OpenRouter chat-completions client — the only file that knows
 * OpenRouter's URL, headers, request fields and error shapes.
 *
 * No top-level side effects and no environment read: the key and `fetch` are
 * passed in, as src/lib/catalog/rawg.ts does for RAWG, and the classification
 * of a failure is a pure function that can be called with data.
 *
 * The key travels in the Authorization header and nowhere else. No result,
 * thrown message or log line carries it, and no error object from `fetch` is
 * kept, because its message or `cause` may describe the request.
 */
import { z } from "zod";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;
/** The wait before the one retry when the response carries no Retry-After. */
const DEFAULT_RETRY_DELAY_MS = 2_000;
/** Retry-After is honoured up to this long; anything longer is an outage. */
const MAX_RETRY_DELAY_MS = 20_000;
const MAX_DETAIL_LENGTH = 300;

export type ChatMessage = { role: "system" | "user"; content: string };

/** The `response_format` field in strict JSON-schema mode. */
export type ResponseFormat = {
  type: "json_schema";
  json_schema: {
    /** a-z, A-Z, 0-9, underscores and dashes, at most 64 characters. */
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
};

/**
 * `systemic` hits every post alike — the key, the credits, a rate limit, a
 * provider outage — so it stops a run and never counts against a post.
 * `post` belongs to one request: its reply, or a refusal of its content.
 */
export type FailureScope = "systemic" | "post";

export type FailureReason =
  // 401: the key is missing, revoked or wrong.
  | "unauthorized"
  // 402: out of credits, or the key's credit limit is spent.
  | "payment_required"
  // 404: no model or endpoint can serve the request as sent.
  | "no_endpoint"
  // 408, or no complete answer within the timeout.
  | "timeout"
  | "rate_limited"
  // Any 5xx (524 and 529 included), a network error, an unreadable envelope.
  | "unavailable"
  // 400 and any other 4xx: the request itself was refused.
  | "bad_request"
  // 403: moderation, or a provider's content policy.
  | "blocked"
  // The reply stopped at max_tokens.
  | "truncated"
  // The reply is not JSON, or not the schema.
  | "invalid_reply";

/**
 * A failed call. It carries a reason, a scope, a status and a detail — never a
 * header or the request, so nothing here can carry the key.
 */
export type Failure = {
  ok: false;
  reason: FailureReason;
  scope: FailureScope;
  /** The HTTP status when a response arrived, null otherwise. */
  status: number | null;
  /**
   * OpenRouter's own error message (prefixed with a 402's `limit_source`), or
   * what was wrong with the reply. Null when there is nothing to add.
   */
  detail: string | null;
};

export type Usage = {
  promptTokens: number | null;
  completionTokens: number | null;
  /** Billed as output tokens, so a model that reasons costs more than it looks. */
  reasoningTokens: number | null;
  costUsd: number | null;
};

export type Completion<T> = {
  ok: true;
  output: T;
  /** The model that answered — with a fallback list, not necessarily the first. */
  model: string;
  usage: Usage;
  generationId: string | null;
};

export type CompletionResult<T> = Completion<T> | Failure;

export type CompletionRequest<T> = {
  messages: ChatMessage[];
  /** Tried in order: a model further down answers only when those above it fail. */
  models: readonly string[];
  responseFormat: ResponseFormat;
  /** Validates every reply, because strict mode is not guaranteed on every endpoint. */
  schema: z.ZodType<T>;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
};

export interface OpenRouterClient {
  complete<T>(request: CompletionRequest<T>): Promise<CompletionResult<T>>;
}

/** A classified failure, before the status is attached. */
export type FailureClass = {
  reason: FailureReason;
  scope: FailureScope;
  /** Worth one more attempt: the same request may well succeed shortly. */
  transient: boolean;
  detail: string | null;
};

/**
 * Returns the OpenRouter key, or throws before any request is made. An empty
 * string counts as unset, because an empty `OPENROUTER_API_KEY=` line in
 * .env.local would otherwise present as a rejected key on the first call.
 */
export function readOpenRouterApiKey(env: {
  OPENROUTER_API_KEY?: string;
}): string {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set — put it in .env.local locally, or in the workflow's env block.",
    );
  }
  return apiKey;
}

/**
 * Whether the model that answered is the one asked. OpenRouter reports the
 * concrete build it served, which may carry a date: asked for
 * "openai/gpt-4.1-nano", it may answer as "openai/gpt-4.1-nano-2025-04-14".
 */
export function isSameModel(asked: string, answered: string): boolean {
  const base = asked.split(":")[0];
  const reported = answered.split(":")[0];
  if (reported === base) return true;
  return (
    reported.startsWith(base) && /^-\d[\d-]*$/.test(reported.slice(base.length))
  );
}

// The error object OpenRouter puts at the top of the body, or inside the
// choice when a provider failed mid-generation. Only the fields read here.
const errorSchema = z.object({
  code: z.union([z.number(), z.string()]).nullish(),
  message: z.string().nullish(),
  metadata: z.object({ limit_source: z.string().nullish() }).nullish(),
});

function singleLine(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_LENGTH);
}

/** The error a body carries, with its numeric code when it has one. */
function readError(
  body: unknown,
): { code: number | null; detail: string | null } | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as { error?: unknown; choices?: unknown };
  const embedded =
    record.error ??
    (Array.isArray(record.choices)
      ? (record.choices[0] as { error?: unknown } | undefined)?.error
      : undefined);

  const parsed = errorSchema.safeParse(embedded);
  if (!parsed.success) return null;

  const { code, message, metadata } = parsed.data;
  const numeric =
    typeof code === "number"
      ? code
      : typeof code === "string" && /^\d{3}$/.test(code)
        ? Number(code)
        : null;
  const parts = [metadata?.limit_source, message].filter(
    (part): part is string => typeof part === "string" && part !== "",
  );
  return {
    code: numeric,
    detail: parts.length > 0 ? singleLine(parts.join(": ")) : null,
  };
}

/**
 * Classifies a failed call. `status` is the HTTP status, or "network" or
 * "timeout" when no response arrived; `body` is the parsed body, if any.
 *
 * An error inside the body takes precedence over the status — on a 200 too,
 * where OpenRouter reports a provider that failed mid-generation — because
 * the body is where OpenRouter says what went wrong. Transient failures are
 * retried once by the client; the scope applies only when the retry fails too.
 */
export function classifyOpenRouterFailure(
  status: number | "network" | "timeout",
  body?: unknown,
): FailureClass {
  if (status === "network") {
    return {
      reason: "unavailable",
      scope: "systemic",
      transient: true,
      detail: null,
    };
  }
  if (status === "timeout") {
    return {
      reason: "timeout",
      scope: "systemic",
      transient: true,
      detail: null,
    };
  }

  const error = readError(body);
  const code = error?.code ?? status;
  const detail = error?.detail ?? null;

  const systemic = (reason: FailureReason, transient: boolean) =>
    ({ reason, scope: "systemic", transient, detail }) as const;
  const post = (reason: FailureReason) =>
    ({ reason, scope: "post", transient: false, detail }) as const;

  if (code === 401) return systemic("unauthorized", false);
  // Whatever the limit_source: credits, the key's limit and the in-flight
  // budget all stop every post alike.
  if (code === 402) return systemic("payment_required", false);
  if (code === 404) return systemic("no_endpoint", false);
  if (code === 408) return systemic("timeout", true);
  if (code === 429) return systemic("rate_limited", true);
  if (code === 403) return post("blocked");
  if (code >= 400 && code < 500) return post("bad_request");
  // Any 5xx — Cloudflare's 524 and the overloaded 529 among them — and a
  // status that is no error at all, such as a 200 carrying an error without
  // a code.
  return systemic("unavailable", true);
}

/**
 * The wait a Retry-After header asks for — seconds or an HTTP date — capped
 * at MAX_RETRY_DELAY_MS, or the default when the header is absent or
 * unreadable.
 */
function retryDelayMs(header: string | null, now: number): number {
  if (header === null || header.trim() === "") return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - now;
  if (!Number.isFinite(ms)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(Math.max(ms, 0), MAX_RETRY_DELAY_MS);
}

/** AbortSignal.timeout rejects with a DOMException named TimeoutError. */
function isTimeout(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "TimeoutError"
  );
}

// Only the fields the client reads. z.object drops every other key.
const completionSchema = z.object({
  id: z.string().nullish(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
      completion_tokens_details: z
        .object({ reasoning_tokens: z.number().nullish() })
        .nullish(),
      cost: z.number().nullish(),
    })
    .nullish(),
});

type Attempt<T> = {
  result: CompletionResult<T>;
  transient: boolean;
  retryAfterMs: number;
};

function failed<T>(
  failure: FailureClass,
  status: number | null,
  retryAfterMs: number,
): Attempt<T> {
  const { transient, ...rest } = failure;
  return { result: { ok: false, status, ...rest }, transient, retryAfterMs };
}

function badReply<T>(
  reason: "truncated" | "invalid_reply" | "blocked",
  status: number,
  detail: string,
): Attempt<T> {
  return failed(
    { reason, scope: "post", transient: false, detail },
    status,
    DEFAULT_RETRY_DELAY_MS,
  );
}

function requestBody<T>(request: CompletionRequest<T>) {
  return {
    models: request.models,
    messages: request.messages,
    response_format: request.responseFormat,
    // Only endpoints that support every field sent — the strict JSON schema
    // above all. It is also why the cap goes as `max_tokens`: on the catalogue
    // of 2026-09-29 every Mistral Small 3.2 endpoint lists it, while
    // gpt-4.1-nano's two Azure endpoints list only `max_completion_tokens`,
    // which no Mistral Small endpoint lists. Nano is then served by its OpenAI
    // endpoint alone. No `seed` either: Venice, a Mistral Small endpoint,
    // lacks it.
    provider: { require_parameters: true },
    max_tokens: request.maxTokens,
    temperature: request.temperature,
  };
}

export function createOpenRouterClient(deps: {
  apiKey: string;
  fetch: typeof fetch;
  /** Injected so that a test can skip the wait before the retry. */
  sleep?: (ms: number) => Promise<void>;
}): OpenRouterClient {
  // Called unbound: a browser fetch invoked as a method of `deps` throws
  // "Illegal invocation".
  const { apiKey, fetch: fetchImpl } = deps;
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function attempt<T>(
    request: CompletionRequest<T>,
  ): Promise<Attempt<T>> {
    // Every catch below drops the error object: its message or `cause` may
    // describe the request.
    let response: Response;
    try {
      response = await fetchImpl(COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody(request)),
        signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      return failed(
        classifyOpenRouterFailure(isTimeout(err) ? "timeout" : "network"),
        null,
        DEFAULT_RETRY_DELAY_MS,
      );
    }

    const retryAfterMs = retryDelayMs(
      response.headers.get("retry-after"),
      Date.now(),
    );

    // Read and parse apart: the timeout can still fire, or the connection
    // drop, while the body streams in — an outage, not a malformed answer.
    let text: string;
    try {
      text = await response.text();
    } catch (err) {
      return failed(
        classifyOpenRouterFailure(isTimeout(err) ? "timeout" : "network"),
        response.status,
        retryAfterMs,
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      // An error page is judged by its status; a 200 that is not JSON is an
      // unreadable envelope, which classifies as unavailable.
      return failed(
        classifyOpenRouterFailure(response.status),
        response.status,
        retryAfterMs,
      );
    }

    // A 200 can carry an error too, so the body is read before the status is
    // trusted.
    if (!response.ok || readError(body) !== null) {
      return failed(
        classifyOpenRouterFailure(response.status, body),
        response.status,
        retryAfterMs,
      );
    }

    const envelope = completionSchema.safeParse(body);
    if (!envelope.success) {
      return badReply(
        "invalid_reply",
        response.status,
        "the response carries no reply",
      );
    }

    const [choice] = envelope.data.choices;
    if (choice.finish_reason === "length") {
      return badReply("truncated", response.status, "the reply hit max_tokens");
    }
    if (choice.finish_reason === "content_filter") {
      return badReply(
        "blocked",
        response.status,
        "the reply was stopped by a content filter",
      );
    }

    const content = choice.message.content;
    if (!content) {
      return badReply("invalid_reply", response.status, "the reply is empty");
    }

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return badReply(
        "invalid_reply",
        response.status,
        "the reply is not JSON",
      );
    }

    const output = request.schema.safeParse(json);
    if (!output.success) {
      const issue = output.error.issues[0];
      const field =
        issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
      return badReply(
        "invalid_reply",
        response.status,
        singleLine(
          `the reply does not match the schema — ${field}${issue.message}`,
        ),
      );
    }

    const usage = envelope.data.usage;
    return {
      result: {
        ok: true,
        output: output.data,
        model: envelope.data.model,
        usage: {
          promptTokens: usage?.prompt_tokens ?? null,
          completionTokens: usage?.completion_tokens ?? null,
          reasoningTokens:
            usage?.completion_tokens_details?.reasoning_tokens ?? null,
          costUsd: usage?.cost ?? null,
        },
        generationId:
          envelope.data.id ?? response.headers.get("x-generation-id"),
      },
      transient: false,
      retryAfterMs,
    };
  }

  return {
    async complete<T>(
      request: CompletionRequest<T>,
    ): Promise<CompletionResult<T>> {
      const first = await attempt(request);
      if (first.result.ok || !first.transient) return first.result;

      // One retry for a failure that may clear by itself. A second failure is
      // an outage, and the caller stops the run on it.
      await sleep(first.retryAfterMs);
      return (await attempt(request)).result;
    },
  };
}
