export interface ShortLink {
  slug: string;
  status: 'active' | 'inactive' | 'expired';
  merchantId: string;
  campaignId: string;
  updatedAt: string;
  destinationUrl?: string;
}

export interface RedirectParams {
  shortLinkId: string;
  sid?: string;
}