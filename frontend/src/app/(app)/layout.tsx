"use client";

import { AppShell, AppShellSkeleton } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();

  if (!ready || !user) {
    return <AppShellSkeleton />;
  }

  return <AppShell>{children}</AppShell>;
}
