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
      return NextResponse.json({ result: 0, message: 'Shortlink not found' });
    }

    // Check if shortlink is active
    const isActive = ShortLinkService.isActive(shortLinkData);

    return NextResponse.json({
      result: isActive ? 1 : 0,
      message: isActive ? 'Shortlink is active' : 'Shortlink is inactive',
      data: {
        slug: shortLinkData.slug,
        status: shortLinkData.status,
        merchantId: shortLinkData.merchantId,
        campaignId: shortLinkData.campaignId,
        updatedAt: shortLinkData.updatedAt
      }
    });

  } catch (error) {
    console.error('Error checking shortlink:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}