"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileText, LogOut, Menu, MessageSquareText, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { roleLabel, type User } from "@/lib/auth";
import { useHealth } from "@/lib/use-health";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/documents", label: "Tài liệu", icon: FileText },
  { href: "/ask", label: "Hỏi đáp", icon: MessageSquareText },
  { href: "/system", label: "Hệ thống", icon: Activity },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function SidebarNav({
  user,
  instanceId,
  onNavigate,
  onCollapse,
}: {
  user: User;
  instanceId?: string;
  onNavigate?: () => void;
  onCollapse?: () => void;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn("flex items-center gap-2 px-3 py-4", onNavigate && "pr-12")}>
        <div className="min-w-0 flex-1">
          <BrandMark />
        </div>
        {onCollapse ? (
          <button
            type="button"
            aria-label="Đóng menu"
            aria-expanded="true"
            title="Đóng menu"
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-muted"
            onClick={onCollapse}
          >
            <PanelLeftClose className="size-5" />
          </button>
        ) : null}
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "text-slate-600 hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4 pb-14">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
            {initials(user.name || user.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.tenantName}</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-primary">{roleLabel(user.role)}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          Served by: {instanceId ?? "—"}
        </p>
        <Button
          variant="ghost"
          className="mt-2 h-9 w-full justify-start px-2 text-slate-600"
          onClick={signOut}
        >
          <LogOut />
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden w-64 border-r border-border bg-white p-5 lg:block">
        <div className="h-9 w-40 animate-pulse rounded-xl bg-muted" />
        <div className="mt-8 space-y-2">
          <div className="h-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
      <div className="flex-1 p-6 lg:p-8">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-muted" />
        <div className="mt-4 h-4 w-72 max-w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}

function CollapsedNav({ user, onExpand }: { user: User; onExpand: () => void }) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <div className="flex h-full w-16 flex-col items-center bg-sidebar py-4">
      <button
        type="button"
        aria-label="Mở menu"
        aria-expanded="false"
        title="Mở menu"
        className="flex size-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-muted"
        onClick={onExpand}
      >
        <PanelLeftOpen className="size-5" />
      </button>
      <nav className="mt-4 flex flex-1 flex-col items-center gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl transition-colors",
                active
                  ? "bg-accent text-primary"
                  : "text-slate-600 hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-2 pb-4">
        <span
          title={`${user.name} · ${user.tenantName}`}
          className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary"
        >
          {initials(user.name || user.email)}
        </span>
        <button
          type="button"
          aria-label="Đăng xuất"
          title="Đăng xuất"
          className="flex size-9 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-muted"
          onClick={signOut}
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const health = useHealth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const [navReady, setNavReady] = useState(false);
  const lockScroll = pathname === "/ask" || pathname.startsWith("/ask/");

  useEffect(() => {
    if (localStorage.getItem("docmind.nav.open") === "0") setNavOpen(false);
    setNavReady(true);
  }, []);

  useEffect(() => {
    if (!navReady) return;
    localStorage.setItem("docmind.nav.open", navOpen ? "1" : "0");
  }, [navOpen, navReady]);

  if (!user) return <AppShellSkeleton />;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "hidden h-dvh min-w-0 shrink-0 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
          navOpen ? "w-64" : "w-16",
        )}
      >
        {navOpen ? (
          <div className="h-full w-64">
            <SidebarNav
              user={user}
              instanceId={health.data?.instanceId}
              onCollapse={() => setNavOpen(false)}
            />
          </div>
        ) : (
          <CollapsedNav user={user} onExpand={() => setNavOpen(true)} />
        )}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Đóng menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="animate-in slide-in-from-left relative flex h-full w-72 flex-col shadow-xl duration-200">
            <button
              type="button"
              aria-label="Đóng menu"
              className="absolute top-4 right-3 z-10 flex size-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-muted"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" />
            </button>
            <SidebarNav
              user={user}
              instanceId={health.data?.instanceId}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-white/90 px-4 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Mở menu"
            className="flex size-9 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <BrandMark />
        </header>
        <main
          className={cn(
            "flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
            lockScroll ? "overflow-hidden" : "overflow-y-auto",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
