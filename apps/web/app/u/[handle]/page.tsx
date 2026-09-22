import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotConfigured } from "@/components/not-configured";
import { ProfileView } from "@/components/profile-view";
import { getProfilePage } from "@/lib/data";
import { HANDLE_RE, parsePeriod } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle).toLowerCase()}` };
}

export default async function ProfileRoute({ params, searchParams }: Props) {
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const period = parsePeriod((await searchParams).period, "month");
  if (!HANDLE_RE.test(handle)) notFound();

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-14">
        <h1 className="display text-5xl sm:text-6xl">@{handle}</h1>
        <div className="mt-8 max-w-2xl">
          <NotConfigured what="Profiles will show up here" />
        </div>
      </div>
    );
  }

  const res = await getProfilePage(handle, period, supabase);
  if (!res.configured) notFound();
  if (res.error) throw new Error("profile_page failed");
  if (!res.data) notFound();
  return <ProfileView p={res.data} />;
}
