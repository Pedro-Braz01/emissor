import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/cadastro', '/api/auth/callback'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const cookieOptions = {
            ...options,
            sameSite: 'lax' as const,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
          };
          request.cookies.set({ name, value, ...cookieOptions });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...cookieOptions });
        },
        remove(name: string, options: CookieOptions) {
          const cookieOptions = {
            ...options,
            sameSite: 'lax' as const,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 0,
          };
          request.cookies.set({ name, value: '', ...cookieOptions });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...cookieOptions });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
  const isApiRoute = pathname.startsWith('/api/');

  // Não redirecionar rotas de API — elas retornam JSON 401
  if (isApiRoute) {
    return response;
  }

  if (!user && !isPublic && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (user && isPublic && pathname !== '/reset-password') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Headers de segurança
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
