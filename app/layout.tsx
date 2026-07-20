import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";
import SessionProvider from "@/components/SessionProvider";
import { auth } from "@/auth";
import { Toaster } from "sonner";

const roboto = Roboto({
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Setlist Extractor",
  description: "Extract tracklists from SoundCloud mixes",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const showNav = !!session?.user;

  return (
    <html
      lang="en"
      className={`${roboto.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider session={session}>
          <Toaster position="top-right" richColors />
          {showNav && <TopNav />}
          <div className={showNav ? "pt-14 flex flex-col flex-1" : "flex flex-col flex-1"}>
            {children}
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
