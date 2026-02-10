export interface ShortLink {
  slug: string;
  status: 'active' | 'inactive' | 'expired';
  merchantId: string;
  campaignId: string;
  landingId?: string;
  updatedAt: string;
  destinationUrl?: string;
  // Attribution fields
  placeId?: string;
  channel?: 'qr' | 'nfc' | 'email' | 'direct' | 'social' | 'paid' | 'referral' | 'web' | 'print' | 'custom';
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface RedirectParams {
  shortLinkId: string;
  sid?: string;
}