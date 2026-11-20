import type { TrackLinks as Links } from "@/lib/hooks/use-track-links";
import { searchLinks } from "@/lib/hooks/use-track-links";

interface Props {
  artist: string;
  title: string;
  links?: Links;
}

/** Bandcamp has no public search API: always a track search ("item_type=t"). */
export function bandcampSearchUrl(artist: string, title: string): string {
  return `https://bandcamp.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&item_type=t`;
}

/**
 * Spotify, Apple Music and Bandcamp icons. Full color = link to the song itself;
 * faded = not found there (or no lookup possible, like Bandcamp), so the link opens a search.
 */
export default function TrackLinks({ artist, title, links }: Props) {
  const { spotify, apple } = links ?? searchLinks(artist, title);
  const iconClass = (direct: boolean) =>
    `block rounded-full transition hover:scale-110 ${direct ? "" : "opacity-35 grayscale hover:opacity-80 hover:grayscale-0"}`;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <a
        href={spotify.url}
        target="_blank"
        rel="noopener noreferrer"
        title={spotify.direct ? "Open on Spotify" : "Search on Spotify"}
        aria-label={`${spotify.direct ? "Open" : "Search"} ${title} by ${artist} on Spotify`}
        className={iconClass(spotify.direct)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="12" fill="#1DB954" />
          <path
            fill="#fff"
            d="M17.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z"
          />
        </svg>
      </a>
      <a
        href={apple.url}
        target="_blank"
        rel="noopener noreferrer"
        title={apple.direct ? "Open on Apple Music" : "Search on Apple Music"}
        aria-label={`${apple.direct ? "Open" : "Search"} ${title} by ${artist} on Apple Music`}
        className={`${iconClass(apple.direct)} rounded-md`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect width="24" height="24" rx="5.5" fill="#FA2D48" />
          <path
            fill="#fff"
            d="M16.6 5.4v9.1a2.4 2.4 0 1 1-1.5-2.23V8.3l-5.6 1.2v6.6a2.4 2.4 0 1 1-1.5-2.23V7.7a.6.6 0 0 1 .47-.58l7.4-1.6a.6.6 0 0 1 .73.58z"
          />
        </svg>
      </a>
      <a
        href={bandcampSearchUrl(artist, title)}
        target="_blank"
        rel="noopener noreferrer"
        title="Search on Bandcamp"
        aria-label={`Search ${title} by ${artist} on Bandcamp`}
        className={`${iconClass(false)} rounded-md`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect width="24" height="24" rx="5.5" fill="#1DA0C3" />
          <path fill="#fff" d="M9.2 7.5h10.3l-4.7 9H4.5z" />
        </svg>
      </a>
    </div>
  );
}
