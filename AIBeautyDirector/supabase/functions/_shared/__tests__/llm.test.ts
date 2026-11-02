/** @jest-environment node */
import { createLlm, llmEnvFrom, MOCK_CHAT } from '../adapters/llm';
import { buildTools, intentStrings, parseToolCalls } from '../chat/tools';
import { baseData } from '../../chat/__fixtures__/fake-db';
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

const tools = buildTools(baseData);

describe('mock llm', () => {
  it('answers text requests with the mock reply and tool requests with a safe suggest_replies call', async () => {
    const llm = createLlm({ mode: 'mock', provider: 'openai', apiKey: '', model: 'x' });
    for (const locale of LOCALES) {
      const text = await llm.complete({ ...req, locale });
      expect(text.text).toBe(MOCK_CHAT[locale].text);
      expect(text.toolCalls).toBeUndefined();
      expect(checkReply(text.text).ok).toBe(true);
      const intents = parseToolCalls((await llm.complete({ ...req, locale, tools })).toolCalls ?? []);
      expect(intents[0]?.type).toBe('quick_replies');
      for (const i of intents) for (const s of intentStrings(i)) expect(checkReply(s).ok).toBe(true);
    }
  });
});

describe('real llm', () => {
  const reply = (message: object, finish = 'stop') =>
    new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: finish, message }], usage: { prompt_tokens: 1, completion_tokens: 2 } }));

  it('sends tools as strict functions only when given, and reads the tool calls back', async () => {
    const bodies: any[] = [];
    const fetchFn = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return bodies.length === 1
        ? reply({ content: null, tool_calls: [{ type: 'function', function: { name: 'show_scan', arguments: '{}' } }] }, 'tool_calls')
        : reply({ content: 'hi' });
    }) as unknown as typeof fetch;
    const llm = createLlm({ mode: 'real', provider: 'openai', apiKey: 'k', model: 'm' }, fetchFn);
    const withTools = await llm.complete({ ...req, locale: 'en', tools });
    const plain = await llm.complete({ ...req, locale: 'en' });
    expect(bodies[0].tools).toHaveLength(tools.length);
    expect(bodies[0].tools.every((t: any) => t.type === 'function' && t.function.strict === true)).toBe(true);
    expect(bodies[0].tool_choice).toBe('auto');
    expect(bodies[0].parallel_tool_calls).toBe(true);
    expect(bodies[0].response_format).toBeUndefined();
    expect(withTools).toMatchObject({ text: '', toolCalls: [{ name: 'show_scan', arguments: '{}' }] });
    expect(bodies[1].tools).toBeUndefined();
    expect(plain.text).toBe('hi');
    expect(plain.toolCalls).toBeUndefined();
  });

  it('accepts "no call, no text" for a tool request but not for a text request', async () => {
    const llm = createLlm({ mode: 'real', provider: 'openai', apiKey: 'k', model: 'm' }, (async () => reply({ content: '' })) as unknown as typeof fetch);
    await expect(llm.complete({ ...req, locale: 'en', tools })).resolves.toMatchObject({ toolCalls: [] });
    await expect(llm.complete({ ...req, locale: 'en' })).rejects.toMatchObject({ detail: 'empty' });
    const toolFinish = createLlm({ mode: 'real', provider: 'openai', apiKey: 'k', model: 'm' }, (async () => reply({ content: 'x' }, 'tool_calls')) as unknown as typeof fetch);
    await expect(toolFinish.complete({ ...req, locale: 'en' })).rejects.toMatchObject({ detail: 'tool_calls' });
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
