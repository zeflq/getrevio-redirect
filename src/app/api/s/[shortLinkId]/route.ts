import { ShortLinkService } from '@/lib/shortlink-service';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortLinkId: string }> }
) {
  const { shortLinkId } = await params;

  try {
    // Get short link data with fallback strategy
    const shortLinkData = await ShortLinkService.getShortLink(shortLinkId);

    if (!shortLinkData) {
      return new NextResponse('Short link not found', { 
        status: 404,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    // Check if short link is active
    if (!ShortLinkService.isActive(shortLinkData)) {
      return new NextResponse('Short link is inactive or expired', { 
        status: 410, // Gone
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    // Build redirect URL
    const redirectUrl = ShortLinkService.buildRedirectUrl(shortLinkData);

    // Return 302 redirect
    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'X-Short-Link-Id': shortLinkId,
        'X-Merchant-Id': shortLinkData.merchantId,
        'X-Campaign-Id': shortLinkData.campaignId,
      }
    });

  } catch (error) {
    console.error('Redirect API error:', error);
    
    return new NextResponse('Internal server error', { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });
  }
}

// Handle other HTTP methods
export async function POST() {
  return new NextResponse('Method not allowed', { status: 405 });
}

export async function PUT() {
  return new NextResponse('Method not allowed', { status: 405 });
}

export async function DELETE() {
  return new NextResponse('Method not allowed', { status: 405 });
}