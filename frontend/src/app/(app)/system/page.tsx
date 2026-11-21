"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { HealthSnapshot } from "@/lib/types";
import { useHealth } from "@/lib/use-health";
import { cn } from "@/lib/utils";

type FeedItem = HealthSnapshot & { receivedAt: number };

type InstanceLoad = {
  instanceId: string;
  availabilityZone: string;
  count: number;
};

function displayTime(value: string) {
  const formatted = formatDateTime(value);
  return formatted === "—" ? value : formatted;
}

export default function SystemPage() {
  const health = useHealth();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [burstPending, setBurstPending] = useState(false);
  const [errorPending, setErrorPending] = useState(false);
  const [distribution, setDistribution] = useState<InstanceLoad[] | null>(null);

  useEffect(() => {
    if (!health.data) return;
    const receivedAt = health.dataUpdatedAt;
    const snapshot = health.data;
    setFeed((current) => {
      if (current[0]?.receivedAt === receivedAt) return current;
      return [{ ...snapshot, receivedAt }, ...current].slice(0, 10);
    });
  }, [health.data, health.dataUpdatedAt]);

  async function sendBurst() {
    setBurstPending(true);
    try {
      const settled = await Promise.allSettled(
        Array.from({ length: 20 }, () =>
          api<HealthSnapshot>("/api/health", { redirectOnUnauthorized: false }),
        ),
      );
      const ok = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const failed = settled.length - ok.length;
      if (failed > 0) {
        toast.error(`${failed}/20 request thất bại`);
      }
      const counts = new Map<string, InstanceLoad>();
      for (const item of ok) {
        const existing = counts.get(item.instanceId);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(item.instanceId, {
            instanceId: item.instanceId,
            availabilityZone: item.availabilityZone,
            count: 1,
          });
        }
      }
      setDistribution([...counts.values()].sort((a, b) => b.count - a.count));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không gửi được request");
    } finally {
      setBurstPending(false);
    }
  }

  async function triggerError() {
    setErrorPending(true);
    try {
      await api("/api/demo/error", { redirectOnUnauthorized: false });
      toast.success("HTTP 200");
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(`HTTP ${error.statusCode}`);
      } else {
        toast.error("Không gọi được API");
      }
    } finally {
      setErrorPending(false);
    }
  }

  const latest = health.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trạng thái hệ thống</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi instance đang phục vụ và cách cân bằng tải.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Tình trạng hiện tại</CardTitle>
            <CardDescription>Làm mới mỗi 2 giây</CardDescription>
          </CardHeader>
          <CardContent>
            {health.isPending && !latest ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : latest ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-muted/60 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Trạng thái</dt>
                  <dd className="mt-1 flex items-center gap-2 text-lg font-semibold">
                    <span
                      className={cn(
                        "size-2.5 rounded-full",
                        latest.status === "ok" ? "bg-emerald-500" : "bg-amber-500",
                      )}
                    />
                    {latest.status}
                  </dd>
                </div>
                <div className="rounded-xl bg-muted/60 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Instance</dt>
                  <dd className="mt-1 text-lg font-semibold break-all">{latest.instanceId}</dd>
                </div>
                <div className="rounded-xl bg-muted/60 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Vùng sẵn sàng</dt>
                  <dd className="mt-1 text-lg font-semibold">{latest.availabilityZone}</dd>
                </div>
                <div className="rounded-xl bg-muted/60 px-4 py-3">
                  <dt className="text-xs text-muted-foreground">Phản hồi lúc</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{displayTime(latest.time)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-red-600">
                {health.error instanceof Error ? health.error.message : "Không gọi được /api/health"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>10 phản hồi gần nhất</CardTitle>
            <CardDescription>Thời gian, instance và vùng</CardDescription>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Đang chờ phản hồi...</p>
            ) : (
              <ul className="divide-y divide-border">
                {feed.map((item) => (
                  <li
                    key={item.receivedAt}
                    className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 py-2 text-sm"
                  >
                    <span className="font-medium break-all">{item.instanceId}</span>
                    <span className="text-right text-muted-foreground">{item.availabilityZone}</span>
                    <span className="col-span-2 text-xs text-muted-foreground tabular-nums">
                      {displayTime(item.time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void sendBurst()} disabled={burstPending}>
          {burstPending ? "Đang gửi..." : "Gửi 20 request song song"}
        </Button>
        <Button variant="outline" onClick={() => void triggerError()} disabled={errorPending}>
          {errorPending ? "Đang gọi..." : "Tạo lỗi 500"}
        </Button>
      </div>

      {distribution ? (
        <Card>
          <CardHeader>
            <CardTitle>Phân bổ 20 request</CardTitle>
            <CardDescription>Số request mỗi instance đã phục vụ</CardDescription>
          </CardHeader>
          <CardContent>
            {distribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có request thành công.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instance</TableHead>
                    <TableHead>Vùng</TableHead>
                    <TableHead>Số request</TableHead>
                    <TableHead className="w-[36%]">Tỷ lệ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distribution.map((row) => (
                    <TableRow key={row.instanceId}>
                      <TableCell className="font-medium whitespace-normal">{row.instanceId}</TableCell>
                      <TableCell>{row.availabilityZone}</TableCell>
                      <TableCell className="tabular-nums">{row.count}</TableCell>
                      <TableCell>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(row.count / 20) * 100}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
