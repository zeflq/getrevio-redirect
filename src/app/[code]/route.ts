import { ShortLinkService } from '@/lib/shortlink-service';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  console.log(`Received request for short link code: ${code}`);

  try {
    // Get short link data with fallback strategy
    const shortLinkData = await ShortLinkService.getShortLink(code);

    if (!shortLinkData) {
      return new NextResponse('Short link not found', {
        status: 404,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Check if short link is active
    if (!ShortLinkService.isActive(shortLinkData)) {
      return new NextResponse('Short link is inactive or expired', {
        status: 410, // Gone
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Build redirect URL
    const redirectUrl = ShortLinkService.buildRedirectUrl(shortLinkData);

    // No destination URL available - redirect to error page
    if (!redirectUrl) {
      const errorPageUrl = process.env.ERROR_PAGE_URL || 'https://l.getrevio.com/error';
      return NextResponse.redirect(errorPageUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Return 302 redirect
    return NextResponse.redirect(redirectUrl, {
      status: 302,
      headers: {
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        'X-Short-Link-Code': code,
      },
    });
  } catch (error) {
    console.error('Redirect error:', error);

    return new NextResponse('Internal server error', {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
}
