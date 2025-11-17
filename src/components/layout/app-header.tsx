"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  ArrowUpRight,
  BookOpen,
  type LucideIcon,
  LogOut,
  GalleryThumbnails,
  LibraryIcon,
  ImageIcon,
} from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { UserSummary } from "@/types/user";
import { GalleryBatchUploadDialog } from "@/components/gallery/gallery-batch-upload-dialog";

export type HeaderActionVariant = "outline" | "primary";
type HeaderActionIcon = "book-open" | "arrow-up-right";

type AppHeaderActionBase = {
  label: string;
  variant?: HeaderActionVariant;
  icon?: HeaderActionIcon;
};

type AppHeaderLinkAction = AppHeaderActionBase & {
  kind?: "link";
  href: string;
};

type AppHeaderBatchUploadAction = AppHeaderActionBase & {
  kind: "batch-upload";
};

type AppHeaderAction = AppHeaderLinkAction | AppHeaderBatchUploadAction;

export type AppHeaderProps = {
  label: string;
  user: UserSummary;
  actions?: AppHeaderAction | AppHeaderAction[];
};

const ICON_MAP: Record<HeaderActionIcon, LucideIcon> = {
  "book-open": BookOpen,
  "arrow-up-right": ArrowUpRight,
};

const VARIANT_CLASSNAMES: Record<HeaderActionVariant, string> = {
  outline:
    "rounded-full border-white/20 bg-white/5 text-slate-100 hover:bg-white/10",
  primary: "rounded-full bg-white text-black hover:bg-slate-200",
};

const NAV_ITEMS = [
  {
    id: "create",
    href: "/",
    label: "Create",
    activeLabel: "Cover Lab",
    icon: <ImageIcon className="h-4 w-4" />,
  },
  {
    id: "library",
    href: "/library",
    label: "Library",
    activeLabel: "Library",
    icon: <LibraryIcon className="h-4 w-4" />,
  },
  {
    id: "gallery",
    href: "/gallery",
    label: "Gallery",
    activeLabel: "Gallery",
    icon: <GalleryThumbnails className="h-4 w-4" />,
  },
] as const;

export function AppHeader({ label, user, actions }: AppHeaderProps) {
  const router = useRouter();

  const handleSignOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      router.replace("/sign-in");
    }
  }, [router]);

  const actionList = Array.isArray(actions)
    ? actions
    : actions
      ? [actions]
      : [];

  const renderLinkAction = (action: AppHeaderLinkAction) => {
    const variant = action.variant ?? "outline";
    const IconComponent = action.icon ? ICON_MAP[action.icon] : null;

    return (
      <Button
        key={`${action.label}-${action.href}`}
        asChild
        variant={variant === "outline" ? "outline" : "default"}
        className={cn(
          "flex items-center gap-2",
          VARIANT_CLASSNAMES[variant],
        )}
      >
        <Link href={action.href}>
          {IconComponent ? <IconComponent className="h-4 w-4" /> : null}
          {action.label}
        </Link>
      </Button>
    );
  };

  const renderAction = (action: AppHeaderAction) => {
    if (action.kind === "batch-upload") {
      return (
        <GalleryBatchUploadDialog
          key="batch-upload"
          label={action.label}
          variant={action.variant}
        />
      );
    }

    return renderLinkAction({
      kind: "link",
      ...action,
    });
  };

  return (
    <header className="flex flex-col gap-8">
      <div className="flex flex-row items-center justify-between gap-4">
        <Link href="/">
          <Image src="/follio_logo.svg" alt="Follio" width={100} height={100} className="h-20 w-auto" />
        </Link>
        <nav>
          <ul className="flex flex-row items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <li className="group" key={item.id}>
                <Link href={item.href}>
                  <span
                    className={cn(
                      "text-xl text-white/50 group-hover:text-white transition-colors duration-300 flex flex-row items-center gap-2",
                      label === item.activeLabel ? "text-white" : "text-white/50",
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <h1 className="text-xl font-semibold tracking-tight text-white">
                {user.name ?? user.email}
              </h1>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {actionList.length ? (
        <div className="flex flex-row flex-wrap items-center justify-end gap-3">
          {actionList.map(renderAction)}
        </div>
      ) : null}
    </header>
  );
}


