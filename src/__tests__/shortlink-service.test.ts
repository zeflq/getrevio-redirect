import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import type { ShortLink } from '../types/shortlink';

// ---- Strongly-typed mocks for redis ----
type RedisJsonGet = (key: string) => Promise<ShortLink | null>;
type RedisJsonSet = (key: string, path: string, value: unknown) => Promise<unknown>;

// Mock module BEFORE importing SUT, with explicit function signatures
jest.mock('../lib/redis', () => {
  return {
    redis: {
      json: {
        get: jest.fn<ReturnType<RedisJsonGet>, Parameters<RedisJsonGet>>(),
        set: jest.fn<ReturnType<RedisJsonSet>, Parameters<RedisJsonSet>>(),
      },
    },
  };
});

import { ShortLinkService } from '../lib/shortlink-service';
import { redis } from '../lib/redis';

// Cast the mocked fns so mockResolvedValue is typed correctly
const mockGet = redis.json.get as unknown as jest.MockedFunction<RedisJsonGet>;
const mockSet = redis.json.set as unknown as jest.MockedFunction<RedisJsonSet>;

// ---- Typed helpers for globals ----
type AbortSignalWithTimeout = typeof AbortSignal & {
  timeout?: (ms: number) => AbortSignal;
};

type FetchResponseOk<T> = { ok: true; json: () => Promise<T> };
type FetchResponseErr = { ok: false; status: number };
type FetchResponse<T> = FetchResponseOk<T> | FetchResponseErr;
type FetchMock<T> = jest.Mock<Promise<FetchResponse<T>>, [string, RequestInit?]>;

const realFetch: typeof fetch | undefined = global.fetch as unknown as typeof fetch | undefined;
const realRandomUUID: Crypto['randomUUID'] | undefined = global.crypto?.randomUUID;

beforeAll(() => {
  // Polyfill AbortSignal.timeout without `any`
  const AbortSig = AbortSignal as AbortSignalWithTimeout;
  if (!AbortSig.timeout) {
    AbortSig.timeout = () => new AbortController().signal;
  }

  // Typed fetch mock
  const fetchMock = jest.fn() as unknown as FetchMock<ShortLink>;
  global.fetch = fetchMock as unknown as typeof fetch;

  // Typed crypto.randomUUID mock
  const cryptoMock: Crypto = {
    ...(global.crypto ?? ({} as Crypto)),
    randomUUID: jest.fn(() => 'test-uuid'),
    getRandomValues:
      (global.crypto?.getRandomValues ??
        ((arr: ArrayBufferView) => arr)) as Crypto['getRandomValues'],
    subtle: global.crypto?.subtle ?? ({} as SubtleCrypto),
  };
  Object.defineProperty(global, 'crypto', { value: cryptoMock });
});

afterAll(() => {
  if (realFetch) {
    global.fetch = realFetch;
  }
  if (realRandomUUID) {
    (global.crypto as Crypto).randomUUID = realRandomUUID;
  }
});

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  (global.fetch as unknown as jest.Mock).mockReset();
  delete process.env.FALLBACK_API_URL;
  delete process.env.BASE_REDIRECT_URL;
});

const sample: ShortLink = {
  slug: 'bella-pizza-sept-2025',
  status: 'active',
  merchantId: 'mer_123',
  campaignId: 'cmp_456',
  updatedAt: new Date().toISOString(),
};

describe('ShortLinkService.getFromKV', () => {
  it('returns data when present in KV', async () => {
    mockGet.mockResolvedValue(sample);

    const res = await ShortLinkService.getFromKV('key:123');
    expect(mockGet).toHaveBeenCalledWith('key:123');
    expect(res).toEqual(sample);
  });

  it('returns null when KV throws', async () => {
    mockGet.mockRejectedValue(new Error('boom'));

    const res = await ShortLinkService.getFromKV('key:err');
    expect(res).toBeNull();
  });
});

describe('ShortLinkService.getFromFallbackAPI', () => {
  it('returns null when FALLBACK_API_URL is not set', async () => {
    const res = await ShortLinkService.getFromFallbackAPI('key:missing-env');
    expect(res).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches and returns data when API responds OK', async () => {
    process.env.FALLBACK_API_URL = 'https://api.example.com/shortlinks';
    (global.fetch as unknown as FetchMock<ShortLink>).mockResolvedValue({
      ok: true,
      json: async () => sample,
    });

    const res = await ShortLinkService.getFromFallbackAPI('key:ok');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/shortlinks/key:ok',
      expect.objectContaining({
        signal: expect.any(Object),
        headers: expect.objectContaining({
          Accept: 'application/json',
          'User-Agent': 'ShortLink-Service/1.0',
        }),
      }),
    );
    expect(res).toEqual(sample);
  });

  it('returns null when API responds non-OK', async () => {
    process.env.FALLBACK_API_URL = 'https://api.example.com/shortlinks';
    (global.fetch as unknown as FetchMock<ShortLink>).mockResolvedValue({ ok: false, status: 404 });

    const res = await ShortLinkService.getFromFallbackAPI('key:404');
    expect(res).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    process.env.FALLBACK_API_URL = 'https://api.example.com/shortlinks';
    (global.fetch as unknown as FetchMock<ShortLink>).mockRejectedValue(new Error('network'));

    const res = await ShortLinkService.getFromFallbackAPI('key:err');
    expect(res).toBeNull();
  });
});

describe('ShortLinkService.cacheInKV', () => {
  it('writes to KV with JSON.SET', async () => {
    mockSet.mockResolvedValue('OK');

    await ShortLinkService.cacheInKV('key:cache', sample);
    expect(mockSet).toHaveBeenCalledWith(
      'key:cache',
      '$',
      expect.objectContaining({
        slug: sample.slug,
        merchantId: sample.merchantId,
      }),
    );
  });

  it('swallows KV errors', async () => {
    mockSet.mockRejectedValue(new Error('write-fail'));
    await expect(
      ShortLinkService.cacheInKV('key:cache', sample),
    ).resolves.toBeUndefined();
  });
});

describe('ShortLinkService.getShortLink (KV -> API -> cache)', () => {
  it('returns from KV if present (no API call)', async () => {
    mockGet.mockResolvedValue(sample);

    const res = await ShortLinkService.getShortLink('key:hit');
    expect(res).toEqual(sample);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('falls back to API and caches when KV miss', async () => {
    mockGet.mockResolvedValue(null);
    process.env.FALLBACK_API_URL = 'https://api.example.com/shortlinks';
    (global.fetch as unknown as FetchMock<ShortLink>).mockResolvedValue({
      ok: true,
      json: async () => sample,
    });

    const res = await ShortLinkService.getShortLink('key:miss');
    expect(res).toEqual(sample);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('returns null when both KV and API miss', async () => {
    mockGet.mockResolvedValue(null);
    process.env.FALLBACK_API_URL = 'https://api.example.com/shortlinks';
    (global.fetch as unknown as FetchMock<ShortLink>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const res = await ShortLinkService.getShortLink('key:none');
    expect(res).toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('ShortLinkService.buildRedirectUrl', () => {
  it('builds URL with base + slug + tracking params', () => {
    process.env.BASE_REDIRECT_URL = 'https://app.yourapp.com/r';

    const url = ShortLinkService.buildRedirectUrl(sample);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      'https://app.yourapp.com/r/bella-pizza-sept-2025',
    );
    expect(parsed.searchParams.get('sid')).toBe('test-uuid');
    expect(parsed.searchParams.get('merchantId')).toBe('mer_123');
    expect(parsed.searchParams.get('campaignId')).toBe('cmp_456');
  });
});

describe('ShortLinkService.isActive', () => {
  it('returns true for active and updated within 365 days', () => {
    const recent: ShortLink = {
      ...sample,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    };
    expect(ShortLinkService.isActive(recent)).toBe(true);
  });

  it('returns false when status is not active', () => {
    const inactive: ShortLink = { ...sample, status: 'paused' as ShortLink['status'] };
    expect(ShortLinkService.isActive(inactive)).toBe(false);
  });
});
