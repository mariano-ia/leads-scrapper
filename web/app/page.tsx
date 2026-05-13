import { redirect } from "next/navigation";
import { getCurrentUser, getUserOrgs, isSuperAdmin } from "@/lib/auth";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const orgs = await getUserOrgs(user.id);

  if (orgs.length === 0) {
    const superAdmin = await isSuperAdmin(user.id);
    if (superAdmin) redirect("/admin/orgs");
    redirect("/select-org");
  }

  if (orgs.length === 1) {
    // @ts-expect-error orgs is shaped with nested orgs field
    redirect(`/${orgs[0].orgs.slug}/dashboard`);
  }

  redirect("/select-org");
}
