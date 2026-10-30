/** @jest-environment node */
import { createLlm, llmEnvFrom, MOCK_CHAT } from '../adapters/llm';
import { blockStrings, parseLlmBlocks } from '../chat/llm-output';
import { LOCALES } from '../codes';
import { checkReply } from '../safety/check';

const req = { system: 's', user: 'u', maxTokens: 10, signal: new AbortController().signal };

describe('llm env', () => {
  it('reads the chat model from LLM_MODEL_CHAT when asked', () => {
    const get = (k: string) => ({ LLM_MODEL_REVIEW: 'review-model', LLM_MODEL_CHAT: 'chat-model' })[k];
    expect(llmEnvFrom(get).model).toBe('review-model');
    expect(llmEnvFrom(get, 'LLM_MODEL_CHAT').model).toBe('chat-model');
    expect(llmEnvFrom(() => undefined, 'LLM_MODEL_CHAT').model).toBe('gpt-5-nano');
  });
});

describe('mock llm', () => {
  it('answers text requests with the mock reply and json requests with the mock blocks, both safe', async () => {
    const llm = createLlm({ mode: 'mock', provider: 'openai', apiKey: '', model: 'x' });
    for (const locale of LOCALES) {
      const text = await llm.complete({ ...req, locale });
      expect(text.text).toBe(MOCK_CHAT[locale].text);
      expect(checkReply(text.text).ok).toBe(true);
      const blocks = parseLlmBlocks((await llm.complete({ ...req, locale, json: true })).text);
      expect(blocks[0]?.type).toBe('quick_replies');
      for (const b of blocks) for (const s of blockStrings(b)) expect(checkReply(s).ok).toBe(true);
    }
  });
});

describe('real llm', () => {
  it('asks for a JSON object only when json is set', async () => {
    const bodies: any[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: 'stop', message: { content: '{"text":"ok","blocks":[]}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    }) as unknown as typeof fetch;
    const llm = createLlm({ mode: 'real', provider: 'openai', apiKey: 'k', model: 'm' }, fetchFn);
    await llm.complete({ ...req, locale: 'en', json: true });
    await llm.complete({ ...req, locale: 'en' });
    expect(bodies[0].response_format).toEqual({ type: 'json_object' });
    expect(bodies[1].response_format).toBeUndefined();
  });
});

describe('real llm budget', () => {
  const env = { mode: 'real' as const, provider: 'openai', apiKey: 'k', model: 'm' };
  const body = (finish: string, content: string) =>
    JSON.stringify({ model: 'm', choices: [{ finish_reason: finish, message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 850 } } });
  const llm = (finish: string, content: string) => createLlm(env, (async () => new Response(body(finish, content))) as unknown as typeof fetch);

  it('reports reasoning tokens and names a length cut-off', async () => {
    const ok = await llm('stop', 'hi').complete({ ...req, locale: 'en' });
    expect(ok.reasoningTokens).toBe(850);
    await expect(llm('length', '').complete({ ...req, locale: 'en' })).rejects.toMatchObject({ code: 'provider_failed', detail: 'length' });
    await expect(llm('length', '{"text":"half').complete({ ...req, locale: 'en' })).rejects.toMatchObject({ code: 'provider_failed', detail: 'length' });
  });

  it('leaves reasoning effort to the API default unless LLM_REASONING_EFFORT is set', async () => {
    const bodies: any[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response(body('stop', 'x')); }) as unknown as typeof fetch;
    await createLlm(env, fetchFn).complete({ ...req, locale: 'en' });
    expect(bodies[0].reasoning_effort).toBeUndefined();
    await createLlm({ ...env, reasoningEffort: 'low' }, fetchFn).complete({ ...req, locale: 'en' });
    expect(bodies[1].reasoning_effort).toBe('low');
    expect(llmEnvFrom((k) => ({ LLM_REASONING_EFFORT: 'minimal' })[k]).reasoningEffort).toBe('minimal');
    expect(llmEnvFrom(() => undefined).reasoningEffort).toBeUndefined();
  });
});
