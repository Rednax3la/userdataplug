import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

type CookieItem = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const publicPaths = ["/", "/login", "/pending"];
  const isPublic = publicPaths.includes(pathname) || pathname.startsWith("/api/auth");

  // Not logged in → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in user on /login → check approval, then route
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Logged in — check approval for dashboard routes
  if (user && !isPublic) {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("approved")
      .eq("id", user.id)
      .maybeSingle();

    // If the table doesn't exist yet (migration not run), let through gracefully
    // Error code 42P01 = relation does not exist
    const tableIsMissing = profileError && (
      profileError.code === "42P01" ||
      profileError.message?.includes("does not exist")
    );

    if (!tableIsMissing) {
      // No row (trigger didn't fire yet) OR explicitly not approved → /pending
      const notApproved = !profile || !profile.approved;
      if (notApproved && pathname !== "/pending") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
