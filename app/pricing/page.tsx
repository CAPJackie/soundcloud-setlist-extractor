import Link from "next/link";
import UpgradeButton from "@/components/UpgradeButton";
import ManageSubscriptionButton from "@/components/ManageSubscriptionButton";
import { auth } from "@/auth";
import { FREE_MONTHLY_LIMIT, PRO_MONTHLY_LIMIT, getQuota } from "@/lib/usage";

export const metadata = { title: "Pricing — Setlist Extractor" };

export default async function PricingPage() {
  // Public page: visitors who aren't logged in just see the upgrade button.
  const session = await auth();
  const quota = session?.user?.email ? await getQuota(session.user.email).catch(() => null) : null;

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-16">
      <div className="w-full max-w-3xl flex flex-col gap-10">
        <div className="text-center flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Simple pricing</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Free</h2>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">$0</p>
            </div>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400 flex flex-col gap-2">
              <li>{FREE_MONTHLY_LIMIT} extractions per month</li>
              <li>Audio fingerprinting + description parsing</li>
              <li>Export to Spotify</li>
            </ul>
            <Link
              href="/"
              className="mt-auto w-full text-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Get started
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border-2 border-orange-500 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-orange-600 dark:text-orange-400">Pro</h2>
              <p className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                $8<span className="text-base font-medium text-zinc-500">/mo</span>
              </p>
            </div>
            <ul className="text-sm text-zinc-600 dark:text-zinc-400 flex flex-col gap-2">
              <li>Up to {PRO_MONTHLY_LIMIT} extractions per month</li>
              <li>Everything in Free</li>
              <li>Priority processing</li>
            </ul>
            <div className="mt-auto flex flex-col gap-2">
              {quota?.admin ? (
                <p className="w-full text-center rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold py-3 text-sm">
                  Included with admin access
                </p>
              ) : quota?.plan === "pro" ? (
                <>
                  <p className="text-center text-xs font-medium text-orange-600 dark:text-orange-400">Your current plan</p>
                  <ManageSubscriptionButton />
                </>
              ) : (
                <UpgradeButton />
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-600">
          Cancel anytime. Prices in USD. See our{" "}
          <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
