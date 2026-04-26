"use client";

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
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
      <label htmlFor="url" className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        SoundCloud URL
      </label>
      <div className="flex gap-2">
        <input
          id="url"
          name="url"
          type="url"
          required
          disabled={loading}
          placeholder="https://soundcloud.com/artist/set-name"
          className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 transition"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold px-6 py-3 text-sm transition"
        >
          {loading ? "Analyzing..." : "Extract"}
        </button>
      </div>
    </form>
  );
}
