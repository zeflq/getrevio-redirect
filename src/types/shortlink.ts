export interface ShortLink {
  slug: string;
  status: 'active' | 'inactive' | 'expired';
  merchantId: string;
  campaignId: string;
  updatedAt: string;
}

export interface RedirectParams {
  shortLinkId: string;
  sid?: string;
}