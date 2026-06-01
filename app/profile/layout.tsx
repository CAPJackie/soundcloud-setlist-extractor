import { auth } from "@/auth";
import { redirect } from "next/navigation";
import ProfileSidebar from "@/components/ProfileSidebar";

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl flex gap-8">
        <ProfileSidebar />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
