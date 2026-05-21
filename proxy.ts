import { auth } from "@/auth";
export default auth;

export const config = {
  matcher: [
    "/((?!api/auth|api/migrate|forgot-password|reset-password|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
