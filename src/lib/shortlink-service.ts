import { redis } from './redis';
import { ShortLink } from '../types/shortlink';

export class ShortLinkService {
  private static readonly API_TIMEOUT = 5000; // 5 seconds

  /**
   * Fetch short link data from Redis KV
   */
  static async getFromKV(shortLink: string): Promise<ShortLink | null> {
    try {
      const data = await redis.json.get<ShortLink>(shortLink);
      return data;
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
      
      const data: ShortLink = await response.json();
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
    try {
      await redis.json.set(shortLink, '$', data as unknown as Record<string, unknown>);
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
   */
  static buildRedirectUrl(shortLinkData: ShortLink): string {
    const baseUrl = process.env.BASE_REDIRECT_URL || 'https://app.yourapp.com/r';
    const url = new URL(`${baseUrl}/${shortLinkData.slug}`);
    
    // Add tracking parameters
    url.searchParams.set('sid', crypto.randomUUID());
    url.searchParams.set('merchantId', shortLinkData.merchantId);
    url.searchParams.set('campaignId', shortLinkData.campaignId);
    
    return url.toString();
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