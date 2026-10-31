// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-ignore -- plain ESM server module
import { checkRateLimit, isAllowedGeminiPath } from '../server/aiGateway.mjs';

const fakeRes = () => {
  const res: any = { status: 0, headers: {}, body: '' };
  res.writeHead = (status: number, headers: any) => { res.status = status; res.headers = headers || {}; return res; };
  res.end = (body = '') => { res.body = body; return res; };
  return res;
};

describe('Gemini proxy allow-list', () => {
  it('forwards only the app model and generate methods', () => {
    expect(isAllowedGeminiPath('/v1beta/models/gemini-3.7-flash:generateContent')).toBe(true);
    expect(isAllowedGeminiPath('/v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse')).toBe(true);
    expect(isAllowedGeminiPath('/v1beta/models/gemini-ultra-expensive:generateContent')).toBe(false);
    expect(isAllowedGeminiPath('/v1beta/files')).toBe(false);
    expect(isAllowedGeminiPath('/upload/v1beta/files')).toBe(false);
    expect(isAllowedGeminiPath('/v1beta/models/gemini-3.7-flash:generateContent/../../files')).toBe(false);
    expect(isAllowedGeminiPath('/v1beta/tunedModels/x:generateContent')).toBe(false);
  });
});

describe('AI rate limiting', () => {
  it('allows up to the limit per identity, then returns 429 with Retry-After', () => {
    for (let i = 0; i < 12; i++) expect(checkRateLimit(fakeRes(), 'liveToken', 'uid:a')).toBe(true);
    const res = fakeRes();
    expect(checkRateLimit(res, 'liveToken', 'uid:a')).toBe(false);
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // Another inspector has their own allowance
    expect(checkRateLimit(fakeRes(), 'liveToken', 'uid:b')).toBe(true);
  });
});
