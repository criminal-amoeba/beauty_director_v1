import { z } from 'zod';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { BlockSchema as ServerBlockSchema } from '../../../../supabase/functions/_shared/chat/blocks';
import { chatErrorKey, toChatError } from '../errors';
import { BlockSchema, parseBlocks } from '../blocks';

describe('block schema parity', () => {
  it('matches the server schema exactly', () => {
    expect(z.toJSONSchema(BlockSchema)).toEqual(z.toJSONSchema(ServerBlockSchema));
  });

  it('drops unknown block types on read', () => {
    const quick = { type: 'quick_replies', id: 'b1', options: [{ id: 'o1', label: 'Hi' }] };
    expect(parseBlocks([quick, { type: 'carousel', id: 'b2' }])).toEqual([quick]);
  });
});

describe('toChatError', () => {
  it('reads the function error code, falls back to unknown, and maps a failed fetch to offline', async () => {
    const http = (status: number, body: unknown) => new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
    expect((await toChatError(http(429, { error: 'rate_limited' }))).code).toBe('rate_limited');
    expect((await toChatError(http(500, { error: 'surprise' }))).code).toBe('unknown');
    expect((await toChatError(new FunctionsFetchError(new Error('x')))).code).toBe('offline');
    expect((await toChatError(new Error('x'))).code).toBe('unknown');
  });
});

describe('chatErrorKey', () => {
  it('maps codes to the keys the UI has copy for', () => {
    expect(chatErrorKey('rate_limited')).toBe('rate_limited');
    expect(chatErrorKey('provider_failed')).toBe('unavailable');
    expect(chatErrorKey('provider_timeout')).toBe('timeout');
    expect(chatErrorKey('forbidden')).toBe('generic');
    expect(chatErrorKey('offline')).toBe('offline');
  });
});
