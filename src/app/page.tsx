import { redirect } from "next/navigation";

export default function Home({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  // Handle magic link redirects that land on root with a code param
  if (searchParams.code) {
    redirect(`/auth/callback?code=${searchParams.code}`);
  }
  redirect("/login");
}
