"use client";

import { useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
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
import PasswordInput from "@/components/PasswordInput";
import { usePreventPasswordCopy } from "@/lib/hooks/use-prevent-password-copy";
import { mergeRefs } from "@/lib/utils";

const formSchema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

type FormData = z.infer<typeof formSchema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  usePreventPasswordCopy([passwordRef, confirmRef]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirm: "" },
  });

  const isSubmitting = form.formState.isSubmitting;
  const done = form.formState.isSubmitSuccessful;

  async function onSubmit(data: FormData) {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: data.password }),
    });
    const json = await res.json();
    if (!res.ok) {
      form.setError("root", { message: json.error ?? "Something went wrong" });
      return;
    }
    setTimeout(() => router.push("/login"), 2500);
  }

  if (!token) {
    return (
      <p className="text-sm text-red-500 dark:text-red-400">
        Invalid reset link.{" "}
        <Link href="/forgot-password" className="text-orange-500 hover:text-orange-400">
          Request a new one
        </Link>
        .
      </p>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Password updated successfully.
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  ref={mergeRefs(field.ref, passwordRef)}
                  disabled={isSubmitting}
                  placeholder="At least 8 characters"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  ref={mergeRefs(field.ref, confirmRef)}
                  disabled={isSubmitting}
                  placeholder="••••••••"
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
          className="mt-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : "Set new password"}
        </button>
      </form>
    </Form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">&#127925;</span>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Setlist Extractor
            </h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Set a new password</p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>

          <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/login" className="font-medium text-orange-500 hover:text-orange-400">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
