import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { auth } from "@/lib/auth";

export default async function SignUpPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-6">
      <SignUpForm />
    </div>
  );
}

