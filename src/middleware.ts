import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  if (process.env.DISABLE_TEST_API === 'true') {
    const p = req.nextUrl.pathname;

    // Block all test API routes
    if (p.startsWith('/api/test/')) {
      return NextResponse.json({ error: 'Test API disabled' }, { status: 404 });
    }

    // Block test page and any sub-paths
    if (p === '/test' || p.startsWith('/test/')) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  return NextResponse.next();
}

// Only run for these paths
export const config = {
  matcher: ['/api/test/:path*', '/test', '/test/:path*'],
};
