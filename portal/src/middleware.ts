import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Rotas públicas que não precisam de autenticação
const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Refresh session se expirada
  const { data: { session } } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

  // Se não tem sessão e não é rota pública → redireciona para login
  if (!session && !isPublicRoute && pathname !== '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Se tem sessão e está em rota pública → redireciona para dashboard
  if (session && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Headers de segurança
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica middleware em todas as rotas EXCETO:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico
     * - arquivos com extensões (png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
