import { NextResponse, type NextRequest } from "next/server";

// Pass the pathname to the root layout so it can pick the right theme on the server
// (WGA admin pages get the WGA skin before first paint; dealer pages get their brand).
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
