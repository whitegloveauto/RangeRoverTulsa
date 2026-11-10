import { NextResponse, type NextRequest } from "next/server";
import { WGA_SPLIT, hostOf, isWgaHost, isLocalHost, wgaOrigin } from "@/lib/hosts";

// 1. Pass the pathname to the root layout so it can pick the right theme on the server
//    (WGA admin pages get the WGA skin before first paint; dealer pages get their brand).
// 2. Keep the two sides on their own addresses:
//    • the White Glove address (dealers.whitegloveauto.app) only serves /wga — anything else goes to /wga;
//    • a dealership's address never shows the White Glove side — /wga there goes to the White Glove
//      address (switched on with NEXT_PUBLIC_WGA_SPLIT=1 once that address is live).
export function middleware(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const path = req.nextUrl.pathname;
  const isWgaPath = path === "/wga" || path.startsWith("/wga/");

  if (isWgaHost(host)) {
    if (!isWgaPath && !path.startsWith("/p/")) {
      // stay on the address the person typed (not the server's internal one)
      const url = isLocalHost(host) ? new URL("/wga", req.nextUrl) : new URL("/wga", `https://${hostOf(host)}`);
      return NextResponse.redirect(url);
    }
  } else if (WGA_SPLIT && isWgaPath && !isLocalHost(host)) {
    return NextResponse.redirect(`${wgaOrigin()}${path}${req.nextUrl.search}`);
  }

  const headers = new Headers(req.headers);
  headers.set("x-pathname", path);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next/|api/|.*\\..*).*)"] };
