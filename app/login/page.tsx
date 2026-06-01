"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
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
