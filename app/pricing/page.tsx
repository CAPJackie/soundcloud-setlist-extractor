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
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="flex w-full max-w-3xl flex-col gap-10">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Simple pricing</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Start free. Upgrade when you need more.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Free */}
          <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Free</h2>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">$0</p>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>{FREE_MONTHLY_LIMIT} extractions per month</li>
              <li>Audio fingerprinting + description parsing</li>
              <li>Export to Spotify</li>
            </ul>
            <Link
              href="/"
              className="mt-auto w-full rounded-xl border border-zinc-300 py-3 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Get started
            </Link>
          </div>

          {/* Pro */}
          <div className="flex flex-col gap-4 rounded-2xl border-2 border-orange-500 bg-white p-6 dark:bg-zinc-900">
            <div>
              <h2 className="text-lg font-semibold text-orange-600 dark:text-orange-400">Pro</h2>
              <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                $8<span className="text-base font-medium text-zinc-500">/mo</span>
              </p>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>Up to {PRO_MONTHLY_LIMIT} extractions per month</li>
              <li>Everything in Free</li>
              <li>Priority processing</li>
            </ul>
            <div className="mt-auto flex flex-col gap-2">
              {quota?.admin ? (
                <p className="w-full rounded-xl bg-orange-50 py-3 text-center text-sm font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
                  Included with admin access
                </p>
              ) : quota?.plan === "pro" ? (
                <>
                  <p className="text-center text-xs font-medium text-orange-600 dark:text-orange-400">
                    Your current plan
                  </p>
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
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
