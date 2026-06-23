import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { findUserByEmail, upsertGoogleUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = (credentials.email as string | undefined)?.toLowerCase().trim();
        const password = credentials.password as string | undefined;
        if (!email || !password) return null;

        const user = await findUserByEmail(email);
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: email, email };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        await upsertGoogleUser(user.email);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
      }
      return token;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
