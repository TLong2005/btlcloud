"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";

const DEMO_PASSWORD = "Demo@123";

export default function LoginPage() {
  const { user, ready, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: (data) => {
      signIn(data.accessToken, data.user);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Đăng nhập thất bại");
    },
  });

  if (!ready || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef2ff]">
        <div className="size-10 animate-pulse rounded-full bg-primary/20" />
      </div>
    );
  }

  function fill(nextEmail: string) {
    setEmail(nextEmail);
    setPassword(DEMO_PASSWORD);
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#4F46E5] via-[#6D28D9] to-[#4338CA] px-6 py-8 text-white lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16">
        <div className="pointer-events-none absolute -top-20 -left-16 size-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 size-80 rounded-full bg-violet-200/20 blur-3xl" />
        <div className="relative">
          <BrandMark inverted />
          <p className="mt-6 max-w-md text-lg leading-relaxed font-medium text-white/95 lg:mt-10 lg:text-[1.7rem] lg:leading-snug">
            Hỏi đáp tài liệu nội bộ bằng tiếng Việt, kèm tên tệp nguồn.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center bg-[#f4f6fb] px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Nhập email công ty để vào không gian tài liệu.
          </p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim() || !password) {
                toast.error("Vui lòng nhập email và mật khẩu");
                return;
              }
              mutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@abc.vn"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-10 px-3"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Mật khẩu"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 px-3"
                required
              />
            </div>
            <Button
              type="submit"
              className="h-10 w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                "Đăng nhập"
              )}
            </Button>
          </form>

          <div className="mt-8 space-y-2">
            <p className="text-center text-xs text-muted-foreground">Tài khoản mẫu</p>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full whitespace-normal px-3 py-2.5"
              onClick={() => fill("admin@abc.vn")}
            >
              Dùng tài khoản Quản trị viên
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto w-full whitespace-normal px-3 py-2.5"
              onClick={() => fill("employee@abc.vn")}
            >
              Dùng tài khoản Nhân viên
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
