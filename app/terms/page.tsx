export const metadata = { title: "Terms of Service — Setlist Extractor" };

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex justify-center px-4 py-16">
      <article className="w-full max-w-2xl prose-sm flex flex-col gap-4 text-zinc-700 dark:text-zinc-300">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Terms of Service</h1>
        <p className="text-xs text-zinc-400">Last updated: {new Date().getFullYear()}</p>

        <p>
          Setlist Extractor (&quot;the Service&quot;) identifies tracks from publicly available
          SoundCloud mixes for personal, non-commercial use. By using the Service you agree to
          these terms.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Not affiliated with SoundCloud</h2>
        <p>
          The Service is an independent tool and is not affiliated with, endorsed by, or
          sponsored by SoundCloud. All trademarks belong to their respective owners. You are
          responsible for ensuring your use complies with SoundCloud&apos;s terms and applicable
          copyright law.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Acceptable use</h2>
        <p>
          You agree not to abuse, overload, or attempt to circumvent usage limits of the
          Service, and to use identified track data for personal reference only.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Subscriptions</h2>
        <p>
          Paid plans are billed monthly through Stripe and renew automatically until canceled.
          You can cancel at any time; access continues until the end of the current billing
          period.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No warranty</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind. Track
          identification may be incomplete or inaccurate, and availability depends on
          third-party services that may change without notice.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
        <p>Questions about these terms can be sent to the site administrator.</p>
      </article>
    </main>
  );
}
