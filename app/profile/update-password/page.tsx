"use client";

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

const formSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "At least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof formSchema>;

export default function UpdatePasswordPage() {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(data: FormData) {
    const res = await fetch("/api/profile/update-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      form.setError("root", { message: json.error ?? "Something went wrong" });
      return;
    }
    form.reset();
  }

  const isSuccess = form.formState.isSubmitSuccessful && !form.formState.errors.root;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Update Password</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 max-w-sm">
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <PasswordInput {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="newPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
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
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <PasswordInput {...field} disabled={isSubmitting} />
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

          {isSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Password updated successfully.
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition"
          >
            {isSubmitting ? "Updating…" : "Update password"}
          </button>
        </form>
      </Form>
    </div>
  );
}
