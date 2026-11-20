import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { Skeleton } from "@/components/ui/skeleton";
import DigTracks from "@/components/explore/DigTracks";
import {
  labelSeedArtists,
  loadArtistRecs,
  loadExploreBase,
  loadLabelRecs,
  loadRelatedSets,
  lastfmEnabled,
} from "@/lib/explore";
import { similarDbSets, tracksToDig } from "@/lib/explore-logic";
import { artistKeys } from "@/lib/corroboration";
import { enrichArtistLabels, enrichLabels } from "@/lib/labels";

// Background label lookups (after the page is sent) may take a while.
export const maxDuration = 60;

export default async function ExplorePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const { mySets, otherSets, taste } = await loadExploreBase(email);

  // Fill in missing labels in the background, so the label sections improve on each visit.
  after(async () => {
    // Artist labels first (they drive "Labels to explore"), then per-track labels.
    const seeds = await labelSeedArtists(email).catch(() => []);
    await enrichArtistLabels(
      seeds.map((s) => s.artist),
      25_000,
    ).catch(() => 0);
    const mine = new Set(taste.artists.map((a) => a.key));
    const related = otherSets
      .flatMap((s) => s.tracks)
      .filter((t) => artistKeys(t.artist).some((k) => mine.has(k)));
    await enrichLabels([...mySets.flatMap((s) => s.tracks), ...related], 25_000).catch(() => {});
  });

  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Explore</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Recommendations from the {mySets.length} set{mySets.length === 1 ? "" : "s"} you
            searched or liked.
          </p>
        </header>

        {mySets.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing to go on yet. Extract or like a few sets from{" "}
            <Link href="/" className="text-orange-500 hover:text-orange-400">
              Search
            </Link>{" "}
            or{" "}
            <Link href="/sets" className="text-orange-500 hover:text-orange-400">
              Sets
            </Link>
            , then come back.
          </p>
        ) : (
          <>
            <TasteSection email={email} />
            <Suspense fallback={<SectionSkeleton title="Similar sets" rows={4} />}>
              <SimilarSetsSection email={email} />
            </Suspense>
            <Suspense fallback={<SectionSkeleton title="Artists you might like" rows={3} />}>
              <ArtistsSection email={email} />
            </Suspense>
            <TracksSection email={email} />
            <Suspense fallback={<SectionSkeleton title="Labels to explore" rows={2} />}>
              <LabelsSection email={email} />
            </Suspense>
          </>
        )}
      </div>
    </main>
  );
}

// ---------- sections ----------

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
          {title}
        </h2>
        {hint && <p className="text-xs text-zinc-400 dark:text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SectionSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <Section title={title}>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </Section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-400 dark:text-zinc-500">{children}</p>;
}

function Chip({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      {children}
      {count != null && count > 1 && (
        <span className="text-zinc-400 dark:text-zinc-500">×{count}</span>
      )}
    </span>
  );
}

const q = (s: string) => encodeURIComponent(s);

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] font-medium text-zinc-400 transition hover:text-orange-500 dark:text-zinc-500"
    >
      {children}
    </a>
  );
}

async function TasteSection({ email }: { email: string }) {
  const { taste } = await loadExploreBase(email);
  return (
    <Section
      title="Your taste"
      hint="Artists and labels that show up most across your sets (×N = in N sets)."
    >
      {taste.artists.length === 0 ? (
        <Empty>No confirmed tracks in your sets yet.</Empty>
      ) : (
        <div className="flex flex-wrap gap-2">
          {taste.artists.slice(0, 18).map((a) => (
            <Chip key={a.key} count={a.sets}>
              {a.name}
            </Chip>
          ))}
        </div>
      )}
      {taste.labels.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {taste.labels.slice(0, 10).map((l) => (
            <Chip key={l.key} count={l.sets}>
              <span className="text-orange-500">◆</span> {l.name}
            </Chip>
          ))}
        </div>
      ) : (
        <Empty>
          Labels appear here as they&apos;re looked up in the background (it takes a few visits).
        </Empty>
      )}
    </Section>
  );
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

async function SimilarSetsSection({ email }: { email: string }) {
  const [{ taste, otherSets }, related] = await Promise.all([
    loadExploreBase(email),
    loadRelatedSets(email),
  ]);
  const ready = similarDbSets(taste.artists, otherSets);

  return (
    <Section
      title="Similar sets"
      hint="Sets with a tracklist ready are free to open. Getting a new tracklist uses one extraction."
    >
      {ready.length === 0 && related.length === 0 && <Empty>No similar sets found yet.</Empty>}
      <div className="flex flex-col gap-2">
        {ready.map(({ set, sharedArtists }) => (
          <SetCard
            key={set.id}
            title={set.title}
            subtitle={set.username}
            reason={`Shares ${sharedArtists.slice(0, 3).join(", ")}${sharedArtists.length > 3 ? ` +${sharedArtists.length - 3}` : ""}`}
            href={`/sets/${set.id}`}
            action="View tracklist"
            ready
          />
        ))}
        {related.map((r) => (
          <SetCard
            key={r.scId}
            title={r.title}
            subtitle={`${r.username} · ${formatDuration(r.durationSecs)}`}
            reason={
              r.relatedTo > 1
                ? `Related to ${r.relatedTo} of your sets`
                : "Related to one of your sets"
            }
            artworkUrl={r.artworkUrl}
            href={r.inDb && !r.inDb.incomplete ? `/sets/${r.inDb.id}` : `/?url=${q(r.url)}`}
            action={
              r.inDb && !r.inDb.incomplete
                ? "View tracklist"
                : r.inDb
                  ? "Continue tracklist"
                  : "Get tracklist"
            }
            ready={!!r.inDb && !r.inDb.incomplete}
            soundcloudUrl={r.url}
          />
        ))}
      </div>
    </Section>
  );
}

function SetCard(props: {
  title: string;
  subtitle: string;
  reason: string;
  href: string;
  action: string;
  ready?: boolean;
  artworkUrl?: string | null;
  soundcloudUrl?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      {props.artworkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- SoundCloud CDN artwork, not worth an image loader config
        <img
          src={props.artworkUrl}
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-lg bg-zinc-100 object-cover dark:bg-zinc-800"
        />
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-lg text-orange-500 dark:bg-orange-500/10">
          ♪
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {props.title}
        </span>
        <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{props.subtitle}</span>
        <span className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
          {props.reason}
          {props.soundcloudUrl && (
            <>
              {" · "}
              <a
                href={props.soundcloudUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-orange-500"
              >
                SoundCloud
              </a>
            </>
          )}
        </span>
      </div>
      <Link
        href={props.href}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
          props.ready
            ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            : "bg-orange-500 text-white hover:bg-orange-600"
        }`}
      >
        {props.action}
      </Link>
    </div>
  );
}

async function ArtistsSection({ email }: { email: string }) {
  const recs = await loadArtistRecs(email);
  return (
    <Section
      title="Artists you might like"
      hint={
        lastfmEnabled()
          ? "From artists played alongside yours in other sets, and Last.fm similar artists."
          : "From artists played alongside yours in other sets. Add LASTFM_API_KEY for Last.fm suggestions too."
      }
    >
      {recs.length === 0 ? (
        <Empty>Not enough data yet: extract a few more sets.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {recs.map((r) => (
            <div
              key={r.key}
              className="flex min-w-0 flex-col gap-1 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {r.name}
                </span>
                {r.sources.includes("sets") && (
                  <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                    in sets
                  </span>
                )}
                {r.sources.includes("lastfm") && (
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    last.fm
                  </span>
                )}
              </div>
              {r.because.length > 0 && (
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  Because you like {r.because.join(" and ")}
                </span>
              )}
              <div className="flex gap-3 pt-0.5">
                <ExtLink href={`https://soundcloud.com/search/people?q=${q(r.name)}`}>
                  SoundCloud
                </ExtLink>
                <ExtLink href={`https://open.spotify.com/search/${q(r.name)}/artists`}>
                  Spotify
                </ExtLink>
                <ExtLink href={`https://bandcamp.com/search?q=${q(r.name)}&item_type=b`}>
                  Bandcamp
                </ExtLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

async function TracksSection({ email }: { email: string }) {
  const { taste, mySets, otherSets } = await loadExploreBase(email);
  const tracks = tracksToDig(taste.artists, mySets, otherSets);
  return (
    <Section
      title="Tracks to dig"
      hint="Tracks by your artists that other people's sets play and yours don't."
    >
      {tracks.length === 0 ? (
        <Empty>None yet: this grows as more sets get extracted.</Empty>
      ) : (
        <DigTracks tracks={tracks} />
      )}
    </Section>
  );
}

async function LabelsSection({ email }: { email: string }) {
  const labels = await loadLabelRecs(email);

  return (
    <Section
      title="Labels to explore"
      hint="Labels releasing several of your artists or the ones recommended above (from Discogs), that you rarely play yet."
    >
      {labels.length === 0 ? (
        <Empty>
          {process.env.DISCOGS_TOKEN
            ? "No label suggestions yet. Artist labels are looked up a few at a time, so check back after a visit or two."
            : "Label suggestions need a Discogs token (DISCOGS_TOKEN)."}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {labels.map((l) => (
            <div
              key={l.key}
              className="flex min-w-0 flex-col gap-1 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <span className="text-orange-500">◆</span> {l.name}
              </span>
              {l.yourArtists.length > 0 && (
                <span className="truncate text-xs text-zinc-600 dark:text-zinc-300">
                  Releases {l.yourArtists.slice(0, 3).join(", ")}
                  {l.yourArtists.length > 3 ? ` +${l.yourArtists.length - 3}` : ""}
                </span>
              )}
              {l.recArtists.length > 0 && (
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {l.yourArtists.length > 0 ? "and " : "Releases "}recommended{" "}
                  {l.recArtists.slice(0, 3).join(", ")}
                </span>
              )}
              {(l.tracks > 0 || l.inYourSets > 0) && (
                <span className="truncate text-xs text-zinc-400 dark:text-zinc-500">
                  {[
                    l.tracks > 0
                      ? `${l.tracks} track${l.tracks === 1 ? "" : "s"} in other sets`
                      : "",
                    l.inYourSets > 0 ? `in ${l.inYourSets} of your sets` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              <div className="flex gap-3 pt-0.5">
                <ExtLink href={`https://bandcamp.com/search?q=${q(l.name)}&item_type=b`}>
                  Bandcamp
                </ExtLink>
                <ExtLink href={`https://www.discogs.com/search/?q=${q(l.name)}&type=label`}>
                  Discogs
                </ExtLink>
                <ExtLink href={`https://soundcloud.com/search/people?q=${q(l.name)}`}>
                  SoundCloud
                </ExtLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
