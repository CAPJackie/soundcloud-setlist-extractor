"use client";

import { Input } from "@/components/ui/input";

interface Props {
  onSubmit: (url: string) => void;
  loading: boolean;
}

export default function URLInput({ onSubmit, loading }: Props) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("url") as HTMLInputElement;
    const val = input.value.trim();
    if (val) onSubmit(val);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <label
        htmlFor="url"
        className="text-sm font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400"
      >
        SoundCloud URL
      </label>
      <div className="flex gap-2">
        <Input
          id="url"
          name="url"
          type="url"
          required
          disabled={loading}
          placeholder="https://soundcloud.com/artist/set-name"
          className="h-auto flex-1 rounded-xl px-4 py-3 text-sm placeholder:text-zinc-400 disabled:opacity-50 dark:placeholder:text-zinc-600"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 active:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Extract"}
        </button>
      </div>
    </form>
  );
}
