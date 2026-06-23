"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import PasswordInput from "@/components/PasswordInput";
import { usePreventPasswordCopy } from "@/lib/hooks/use-prevent-password-copy";
import { mergeRefs } from "@/lib/utils";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormData = z.infer<typeof signInSchema>;

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const passwordRef = useRef<HTMLInputElement>(null);
  usePreventPasswordCopy([passwordRef]);

  const form = useForm<FormData>({
    resolver: (values, ctx, options) =>
      zodResolver(modeRef.current === "register" ? registerSchema : signInSchema)(
        values,
        ctx,
        options
      ),
    defaultValues: { email: "", password: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: FormData) {
    if (mode === "register") {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) {
        form.setError("root", { message: json.error ?? "Registration failed" });
        return;
      }
    }

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      form.setError("root", { message: "Invalid email or password" });
      return;
    }

    window.location.href = "/";
  }

  function switchMode(next: "signin" | "register") {
    setMode(next);
    form.clearErrors();
  }

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-2 mb-8">
          <div className="flex items-center gap-2">
            <span className="text-2xl">&#127925;</span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Setlist Extractor
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
          <button
            type="button"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 transition"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
            <span className="text-xs text-zinc-400">or</span>
            <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        disabled={isSubmitting}
                        placeholder="you@example.com"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        ref={mergeRefs(field.ref, passwordRef)}
                        disabled={isSubmitting}
                        placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root && (
                <p className="text-sm text-red-500 dark:text-red-400">
                  {form.formState.errors.root.message}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white transition"
              >
                {isSubmitting
                  ? mode === "signin" ? "Signing in…" : "Creating account…"
                  : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </Form>

          <div className="mt-4 flex flex-col gap-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "signin" ? (
              <>
                <span>
                  Need an account?{" "}
                  <button
                    onClick={() => switchMode("register")}
                    className="text-orange-500 hover:text-orange-400 font-medium"
                  >
                    Create one
                  </button>
                </span>
                <Link href="/forgot-password" className="text-orange-500 hover:text-orange-400 font-medium">
                  Forgot password?
                </Link>
              </>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  onClick={() => switchMode("signin")}
                  className="text-orange-500 hover:text-orange-400 font-medium"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
