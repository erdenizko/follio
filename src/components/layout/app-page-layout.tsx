import type { ReactNode } from "react";

import { AppHeader, type AppHeaderProps } from "@/components/layout/app-header";

type AppPageLayoutProps = {
  label: AppHeaderProps["label"];
  user: AppHeaderProps["user"];
  actions?: AppHeaderProps["actions"];
  children: ReactNode;
};

export function AppPageLayout({
  label,
  user,
  actions,
  children,
}: AppPageLayoutProps) {
  return (
    <div
      className="min-h-screen text-slate-100"
      style={{
        backgroundColor: "#05050a",
        backgroundImage:
          "radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
      }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 md:gap-10 px-6 py-10 lg:py-16">
        <AppHeader label={label} user={user} actions={actions} />
        {children}
      </div>
    </div>
  );
}

