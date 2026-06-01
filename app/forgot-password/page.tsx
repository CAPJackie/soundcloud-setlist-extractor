"use client";

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
import { Input } from "@/components/ui/input";

const formSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type FormData = z.infer<typeof formSchema>;

export default function ForgotPasswordPage() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  });

  const isSubmitting = form.formState.isSubmitting;
  const sent = form.formState.isSubmitSuccessful;
  const email = form.getValues("email");

  async function onSubmit(data: FormData) {
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });
    } catch {
      form.setError("root", { message: "Something went wrong. Please try again." });
    }
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
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Reset your password</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
          {sent ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                If <span className="font-medium text-zinc-900 dark:text-zinc-50">{email}</span> is
                registered, you&apos;ll receive a reset link shortly.
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Check your spam folder if it doesn&apos;t arrive.
              </p>
            </div>
          ) : (
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
                  {isSubmitting ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </Form>
          )}

          <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            <Link href="/login" className="text-orange-500 hover:text-orange-400 font-medium">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
