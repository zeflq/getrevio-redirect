import { NextRequest, NextResponse } from 'next/server';
import { ShortLinkService } from '@/lib/shortlink-service';

export async function POST(request: NextRequest) {
  try {
    const { shortlink } = await request.json();

    if (!shortlink) {
      return NextResponse.json(
        { error: 'Shortlink is required' },
        { status: 400 }
      );
    }

    // Get shortlink data using ShortLinkService
    const shortLinkData = await ShortLinkService.getShortLink(shortlink);

    if (!shortLinkData) {
      return NextResponse.json(
        { error: 'Shortlink not found' },
        { status: 404 }
      );
    }

    // Check if shortlink is active
    const isActive = ShortLinkService.isActive(shortLinkData);

    if (!isActive) {
      return NextResponse.json(
        { error: 'Shortlink is inactive or expired' },
        { status: 410 }
      );
    }

    // Build redirect URL
    const redirectUrl = ShortLinkService.buildRedirectUrl(shortLinkData);

    return NextResponse.json({
      redirectUrl,
      data: {
        slug: shortLinkData.slug,
        status: shortLinkData.status,
        merchantId: shortLinkData.merchantId,
        campaignId: shortLinkData.campaignId,
        updatedAt: shortLinkData.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting redirect URL:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}