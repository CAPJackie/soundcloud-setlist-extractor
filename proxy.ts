import { auth } from "@/auth";
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/migrate|api/spotify-token|forgot-password|reset-password|spotify/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
