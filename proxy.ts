import { auth } from "@/auth";
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/spotify-token|api/billing/webhook|forgot-password|reset-password|spotify/callback|terms|privacy|pricing|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
