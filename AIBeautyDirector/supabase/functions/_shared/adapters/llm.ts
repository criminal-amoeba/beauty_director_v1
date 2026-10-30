// LLM adapter: hides the vendor. The pipeline only ever passes structured, pre-approved data in `user`.
// Mock mode returns a fixed, safe review so everything runs without an API key. Real mode = OpenAI
// Chat Completions over plain fetch (Deno + Jest share this file, so no SDK import). gpt-5 models take
// max_completion_tokens, which INCLUDES hidden reasoning tokens (effort = LLM_REASONING_EFFORT, else the API default): a
// budget that is too small ends in finish_reason "length" with empty content, reported here as detail 'length'.
import { ScanError, type Locale } from '../codes.ts';

export type LlmEnv = { mode: 'mock' | 'real'; provider: string; apiKey: string; model: string; reasoningEffort?: string };

export const DEFAULT_REVIEW_MODEL = 'gpt-5-nano';

export function llmEnvFrom(get: (key: string) => string | undefined, modelKey: 'LLM_MODEL_REVIEW' | 'LLM_MODEL_CHAT' = 'LLM_MODEL_REVIEW'): LlmEnv {
  return {
    mode: get('LLM_MODE') === 'real' ? 'real' : 'mock',
    provider: get('LLM_PROVIDER') ?? 'openai',
    apiKey: get('LLM_API_KEY') ?? get('CHATGPT_KEY') ?? '', // CHATGPT_KEY = the existing dev secret
    model: get(modelKey) || DEFAULT_REVIEW_MODEL,
    reasoningEffort: get('LLM_REASONING_EFFORT') || undefined, // unset = the API default (medium)
  };
}

// json: ask for a JSON object reply (the chat blocks call). The mock answers MOCK_CHAT.text to plain requests and
// {"blocks": MOCK_CHAT.blocks} to json ones, so both chat calls run without a key.
export type LlmRequest = { system: string; user: string; maxTokens: number; locale: Locale; signal: AbortSignal; json?: boolean };
export type LlmResponse = { text: string; model: string; promptTokens: number | null; completionTokens: number | null; reasoningTokens: number | null };
export type Llm = { complete(req: LlmRequest): Promise<LlmResponse> };

export const MOCK_REVIEW: Record<Locale, string> = {
  en: 'Thanks for checking in this week. Your skin looks steady overall, so let us keep the focus on gentle hydration and daily sun protection. You do not need to buy anything new right now. This is general skincare guidance, not medical advice.',
  'zh-TW': '謝謝你本週的檢測。整體看起來很穩定，我們繼續把重點放在溫和保濕和每天防曬。目前不需要購買新的產品。以上是一般保養建議，並非醫療意見。',
};

export const MOCK_CHAT: Record<Locale, { text: string; blocks: unknown[] }> = {
  en: {
    text: 'Thanks for telling me. Your routine already covers the basics, so let us keep it simple this week: a gentle cleanser, moisturizer, and sunscreen in the morning. You do not need to buy anything new.',
    blocks: [{ type: 'quick_replies', options: ['Show my routine', 'What could I change?'] }],
  },
  'zh-TW': {
    text: '謝謝你告訴我。你的保養流程已經涵蓋基本步驟，這週就維持簡單：溫和潔面、保濕，早上加上防曬。目前不需要購買新的產品。',
    blocks: [{ type: 'quick_replies', options: ['看我的保養流程', '可以調整什麼？'] }],
  },
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

type ChatCompletion = {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
};

export function createLlm(env: LlmEnv, fetchFn: typeof fetch = fetch): Llm {
  if (env.mode === 'mock') {
    return {
      complete: async (req) => ({
        text: req.json ? JSON.stringify({ blocks: MOCK_CHAT[req.locale].blocks }) : req.system.includes('weekly review') ? MOCK_REVIEW[req.locale] : MOCK_CHAT[req.locale].text,
        model: 'mock',
        promptTokens: null,
        completionTokens: null,
        reasoningTokens: null,
      }),
    };
  }
  if (env.provider !== 'openai') throw new ScanError('llm_not_configured', 500, env.provider);
  if (!env.apiKey) throw new ScanError('llm_not_configured', 500, 'LLM_API_KEY missing');

  return {
    async complete(req) {
      let res: Response;
      try {
        res = await fetchFn(OPENAI_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: env.model,
            max_completion_tokens: req.maxTokens,
            ...(env.reasoningEffort ? { reasoning_effort: env.reasoningEffort } : {}),
            ...(req.json ? { response_format: { type: 'json_object' } } : {}),
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
          }),
          signal: req.signal,
        });
      } catch (e) {
        if (req.signal.aborted) throw new ScanError('provider_timeout', 504);
        throw new ScanError('provider_failed', 502, (e as Error).name);
      }
      if (!res.ok) throw new ScanError('provider_failed', 502, { status: res.status });
      const body = (await res.json().catch(() => null)) as ChatCompletion | null;
      const choice = body?.choices?.[0];
      // A refusal or a cut-off reply is not a usable review; the caller falls back to the template.
      if (choice?.finish_reason === 'length') throw new ScanError('provider_failed', 502, 'length');
      if (!choice || choice.message?.refusal || (choice.finish_reason && choice.finish_reason !== 'stop')) {
        throw new ScanError('provider_failed', 502, choice?.finish_reason ?? 'no_choice');
      }
      const text = (choice.message?.content ?? '').trim();
      if (!text) throw new ScanError('provider_failed', 502, 'empty');
      return {
        text,
        model: body?.model ?? env.model,
        promptTokens: body?.usage?.prompt_tokens ?? null,
        completionTokens: body?.usage?.completion_tokens ?? null,
        reasoningTokens: body?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      };
    },
  };
}
