import Stripe from "stripe";
import { findUserByEmail, setStripeCustomerId } from "./users";

const key = process.env.STRIPE_SECRET_KEY;

/** Lazily-constructed Stripe client. Throws only when billing is actually used without config. */
export function getStripe(): Stripe {
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
}

/** Ensure the user has a Stripe customer, creating + persisting one if needed. */
export async function getOrCreateCustomer(email: string): Promise<string> {
  const stripe = getStripe();
  const user = await findUserByEmail(email);
  if (user?.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({ email, metadata: { email } });
  await setStripeCustomerId(email, customer.id);
  return customer.id;
}

export async function createCheckoutSession(email: string): Promise<string> {
  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) throw new Error("STRIPE_PRICE_ID_PRO is not set");

  const stripe = getStripe();
  const customer = await getOrCreateCustomer(email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl()}/?upgraded=1`,
    cancel_url: `${appUrl()}/pricing?canceled=1`,
    metadata: { email },
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(email: string): Promise<string> {
  const stripe = getStripe();
  const customer = await getOrCreateCustomer(email);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${appUrl()}/`,
  });
  return session.url;
}
