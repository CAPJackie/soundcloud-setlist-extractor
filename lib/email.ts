import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  await resend.emails.send({
    from: "Setlist Extractor <onboarding@resend.dev>",
    to: email,
    subject: "Reset your password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:20px;font-weight:700;color:#18181b;margin:0 0 8px">Reset your password</h2>
        <p style="font-size:14px;color:#71717a;margin:0 0 24px">
          Click the button below to set a new password. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}"
          style="display:inline-block;background:#f97316;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px">
          Reset password
        </a>
        <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
