"use client";

import { useState } from "react";

interface Props {
  setlistId: string;
  initialLiked: boolean;
}

export default function LikeButton({ setlistId, initialLiked }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, setPending] = useState(false);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    setPending(true);
    const next = !liked;
    setLiked(next);
    try {
      const res = await fetch(`/api/sets/${setlistId}/like`, { method: "POST" });
      const data = await res.json();
      setLiked(data.liked);
    } catch {
      setLiked(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={pending}
      aria-label={liked ? "Unlike set" : "Like set"}
      className={`transition-colors disabled:opacity-50 ${
        liked
          ? "text-red-500"
          : "text-zinc-300 dark:text-zinc-600 hover:text-red-400"
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
    </button>
  );
}
