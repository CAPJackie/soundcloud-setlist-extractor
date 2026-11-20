import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ProfileSidebar from "@/components/ProfileSidebar";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="flex w-full max-w-2xl gap-8">
        <ProfileSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
