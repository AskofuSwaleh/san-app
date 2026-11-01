import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Public routes
  if (path === '/login' || path === '/') {
    return response;
  }

  // Everything else requires login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Fetch role to gate by area
  const { data: staff } = await supabase
    .from('staff')
    .select('role, is_active')
    .eq('auth_user_id', user.id)
    .single();

  if (!staff || !staff.is_active) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('error', 'no_staff');
    return NextResponse.redirect(url);
  }

  if (path.startsWith('/nurse') && !['nurse', 'admin'].includes(staff.role)) {
    const url = request.nextUrl.clone();
    url.pathname = '/teacher';
    return NextResponse.redirect(url);
  }

  if (path.startsWith('/admin') && staff.role !== 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = staff.role === 'nurse' ? '/nurse' : '/teacher';
    return NextResponse.redirect(url);
  }

  return response;
}
