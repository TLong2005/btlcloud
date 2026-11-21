"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { HealthSnapshot } from "@/lib/types";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api<HealthSnapshot>("/api/health", { redirectOnUnauthorized: false }),
    refetchInterval: 2000,
    retry: false,
  });
}
