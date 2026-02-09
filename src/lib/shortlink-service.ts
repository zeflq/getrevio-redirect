import { redis } from './redis';
import { ShortLink } from '../types/shortlink';
import { API_ENDPOINTS } from './endpoints';

export class ShortLinkService {
  private static readonly API_TIMEOUT = 5000; // 5 seconds
  private static readonly KEY_PREFIX = 'sl:';

  private static toRedisKey(shortLink: string): string {
    if (shortLink.startsWith(this.KEY_PREFIX)) {
      return shortLink;
    }
    return `${this.KEY_PREFIX}${shortLink}`;
  }

  private static readonly VALID_CHANNELS = ['qr', 'nfc', 'email', 'direct', 'social', 'paid', 'referral', 'web', 'print', 'custom'] as const;
  private static readonly validChannelSet = new Set<string>(this.VALID_CHANNELS);

  private static parseChannel(ch: unknown): typeof this.VALID_CHANNELS[number] | undefined {
    if (typeof ch !== 'string') return undefined;
    if (this.validChannelSet.has(ch)) {
      return ch as typeof this.VALID_CHANNELS[number];
    }
    return undefined;
  }

  private static parseShortLinkPayload(
    payload: unknown,
    redisKey: string
  ): ShortLink | null {
    if (!payload) {
      return null;
    }

    let parsed: unknown = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload);
      } catch {
        return null;
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    // Full format: { slug, status, merchantId, campaignId, updatedAt }
    if (
      typeof record.slug === 'string' &&
      (record.status === 'active' ||
        record.status === 'inactive' ||
        record.status === 'expired') &&
      typeof record.merchantId === 'string' &&
      typeof record.campaignId === 'string' &&
      typeof record.updatedAt === 'string'
    ) {
      return {
        slug: record.slug,
        status: record.status,
        merchantId: record.merchantId,
        campaignId: record.campaignId,
        updatedAt: record.updatedAt,
        destinationUrl:
          typeof record.destinationUrl === 'string'
            ? record.destinationUrl
            : undefined,
      };
    }

    // Compact format from API: { v, a, u, mid, cid, pid, ch, us, um, uc, ut, uco, ... }
    if (
      typeof record.mid === 'string' &&
      (record.a === 0 || record.a === 1 || record.a === '0' || record.a === '1')
    ) {
      // Check expiration
      let status: 'active' | 'inactive' | 'expired' = 'inactive';
      const isActive = record.a === 1 || record.a === '1';

      if (!isActive) {
        status = 'inactive';
      } else if (record.ea && typeof record.ea === 'number') {
        // ea is expiration timestamp in seconds
        const expiresAt = new Date(record.ea * 1000);
        status = expiresAt < new Date() ? 'expired' : 'active';
      } else {
        status = 'active';
      }

      return {
        slug: redisKey.replace(/^sl:/, ''),
        status,
        merchantId: record.mid as string,
        campaignId: (record.cid as string) ?? '',
        updatedAt: new Date().toISOString(),
        destinationUrl: typeof record.u === 'string' ? record.u : undefined,
        // Attribution fields (compact format)
        placeId: typeof record.pid === 'string' ? record.pid : undefined,
        channel: this.parseChannel(record.ch),
        utmSource: typeof record.us === 'string' ? record.us : undefined,
        utmMedium: typeof record.um === 'string' ? record.um : undefined,
        utmCampaign: typeof record.uc === 'string' ? record.uc : undefined,
        utmTerm: typeof record.ut === 'string' ? record.ut : undefined,
        utmContent: typeof record.uco === 'string' ? record.uco : undefined,
      };
    }

    return null;
  }

  /**
   * Fetch short link data from Redis KV
   */
  static async getFromKV(shortLink: string): Promise<ShortLink | null> {
    const redisKey = this.toRedisKey(shortLink);
    console.log(`Fetching from Redis KV: ${redisKey}`);

    try {
      // API stores as plain string with JSON.stringify
      // Upstash client auto-deserializes JSON, so this returns the parsed object
      const value = await redis.get(redisKey);
      return this.parseShortLinkPayload(value, redisKey);
    } catch (error) {
      console.error('Redis KV error:', error);
      return null;
    }
  }

  /**
   * Fetch short link data from fallback API
   */
  static async getFromFallbackAPI(shortLink: string): Promise<ShortLink | null> {
    const fallbackApiUrl = process.env.FALLBACK_API_URL;

    if (!fallbackApiUrl) {
      console.warn('FALLBACK_API_URL not configured');
      return null;
    }

    try {
      const apiUrl = `${fallbackApiUrl}/${shortLink}`;
      console.log(`Fetching from fallback API: ${apiUrl}`);
      const response = await fetch(apiUrl, {
        signal: AbortSignal.timeout(this.API_TIMEOUT),
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ShortLink-Service/1.0',
        },
      });

      if (!response.ok) {
        console.warn(`Fallback API returned ${response.status} for ${shortLink}`);
        return null;
      }

      const json = await response.json();

      // Handle wrapped API response format: { success: true, data: {...} }
      const data: ShortLink = json.data ?? json;
      return data;
    } catch (error) {
      console.error('Fallback API fetch error:', error);
      return null;
    }
  }

  /**
   * Cache short link data in Redis KV
   */
  static async cacheInKV(shortLink: string, data: ShortLink): Promise<void> {
    const redisKey = this.toRedisKey(shortLink);
    try {
      await redis.set(redisKey, JSON.stringify(data));
    } catch (error) {
      console.error('Redis cache error:', error);
    }
  }

  /**
   * Get short link with fallback strategy: KV -> API -> Cache result
   */
  static async getShortLink(shortLink: string): Promise<ShortLink | null> {
    // Primary: Try Redis KV first
    let shortLinkData = await this.getFromKV(shortLink);

    if (shortLinkData) {
      return shortLinkData;
    }
    // Fallback: Try external API
    shortLinkData = await this.getFromFallbackAPI(shortLink);

    if (shortLinkData) {
      // Cache the API result in KV for future requests
      await this.cacheInKV(shortLink, shortLinkData);
      return shortLinkData;
    }

    // Not found in either KV or API
    return null;
  }

  /**
   * Build redirect URL
   * Returns null if destinationUrl is not available (caller should redirect to error page)
   * @returns Object with url and sId (scan ID for analytics)
   */
  static buildRedirectUrl(shortLinkData: ShortLink): { url: string; sId: string } | null {
    if (!shortLinkData.destinationUrl) {
      // Can't build URL without destinationUrl - we don't have merchant/landing slugs in Redis
      return null;
    }

    const url = new URL(shortLinkData.destinationUrl);
    const sId = crypto.randomUUID(); // scan ID - for tracking unique scans

    // Add tracking parameters for analytics
    url.searchParams.set('slc', shortLinkData.slug); // shortlink code - for attribution
    url.searchParams.set('sId', sId); // scan ID - for unique visits (NOT auth session)

    return { url: url.toString(), sId };
  }

  /**
   * Fire scan event to analytics API
   * Uses async/await for proper integration with next/server after()
   * Logs errors but never throws to avoid breaking redirects
   */
  static async fireScanEvent(shortLinkData: ShortLink, sId: string): Promise<void> {
    console.log('[Analytics] Firing scan event to:', API_ENDPOINTS.analytics.track);
    try {
      const response = await fetch(API_ENDPOINTS.analytics.track, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Source': 'redirect-service', // Custom header for identification (Origin may be stripped in Edge)
        },
        body: JSON.stringify({
          event: 'scan',
          sId,
          shortlinkCode: shortLinkData.slug,
          merchantId: shortLinkData.merchantId,
          campaignId: shortLinkData.campaignId || null,
          placeId: shortLinkData.placeId || null,
          channel: shortLinkData.channel || 'qr', // Default to QR if not specified
          utmSource: shortLinkData.utmSource || null,
          utmMedium: shortLinkData.utmMedium || null,
          utmCampaign: shortLinkData.utmCampaign || null,
          utmTerm: shortLinkData.utmTerm || null,
          utmContent: shortLinkData.utmContent || null,
        }),
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });

      console.log('[Analytics] Scan event response:', response.status, response.statusText);
      if (!response.ok) {
        const text = await response.text();
        console.error('[Analytics] Scan event failed with:', response.status, text);
      }
    } catch (error) {
      // Log but don't throw - analytics should never break redirects
      console.error('[Analytics] Failed to fire scan event:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Check if short link is active
   */
  static isActive(shortLinkData: ShortLink): boolean {
    if (shortLinkData.status !== 'active') {
      return false;
    }
    return true;
  }
}
