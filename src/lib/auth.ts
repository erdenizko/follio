import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

const baseURL =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;

if (!baseURL) {
  throw new Error("Configure BETTER_AUTH_URL or NEXT_PUBLIC_APP_URL for authentication.");
}

type SocialProviders = Record<string, {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
}>;

const socialProviders: SocialProviders | undefined = (() => {
  const providers: SocialProviders = {};
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (githubClientId && githubClientSecret) {
    providers.github = {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      enabled: true,
    };
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      enabled: true,
    };
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
})();

export const auth = betterAuth({
  appName: "Thumbnail & Cover Generator",
  baseURL,
  basePath: "/api/auth",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  socialProviders,
  session: {
    updateAge: 60 * 5,
    expiresIn: 60 * 60 * 24 * 7,
  },
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").filter(
    Boolean,
  ),
});

