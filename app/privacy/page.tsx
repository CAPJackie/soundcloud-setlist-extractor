export const metadata = { title: "Privacy Policy — Setlist Extractor" };

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex justify-center px-4 py-16">
      <article className="w-full max-w-2xl prose-sm flex flex-col gap-4 text-zinc-700 dark:text-zinc-300">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Privacy Policy</h1>
        <p className="text-xs text-zinc-400">Last updated: {new Date().getFullYear()}</p>

        <p>
          This policy explains what data Setlist Extractor collects and how it is used.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Account data</h2>
        <p>
          When you create an account we store your email address and, for password logins, a
          securely hashed password. If you sign in with Google, we store only your email address.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Usage data</h2>
        <p>
          To operate the Service we record which mixes you have extracted and which you have
          liked, associated with your email address, along with a monthly count of your
          extractions for billing and quota purposes. We do not sell your data.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Payments</h2>
        <p>
          Payments are processed by Stripe. We store a Stripe customer identifier and your
          subscription status. We never see or store your card details.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Third-party services</h2>
        <p>
          Track identification uses ACRCloud and AudD; optional playlist export uses Spotify.
          Audio samples from public mixes are sent to these services solely to identify tracks.
        </p>

        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Data requests</h2>
        <p>
          You may request deletion of your account and associated data by contacting the site
          administrator.
        </p>
      </article>
    </main>
  );
}
