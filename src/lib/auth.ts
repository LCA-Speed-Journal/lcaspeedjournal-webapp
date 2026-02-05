/**
 * NextAuth config - credentials provider (coach PIN for MVP).
 * Protects write APIs; read APIs (leaderboard, historical) stay public.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Coach PIN",
      credentials: {
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        // MVP: Single coach PIN from env. Replace with DB lookup later.
        const coachPin = process.env.COACH_PIN ?? "1234";
        if (credentials?.pin === coachPin) {
          return { id: "coach", name: "Coach", email: "coach@lca.local" };
        }
        return null;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
};
