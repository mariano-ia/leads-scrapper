import { Suspense } from "react";
import { requireAuth, requireOrgMembership, isSuperAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { CreditCounterWidget } from "@/components/credit-counter";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { org_slug: string };
}) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(params.org_slug, user.id);
  const sa = await isSuperAdmin(user.id);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex flex-col">
        <Sidebar orgSlug={org.slug} orgName={org.name} role={role} isSuperAdmin={sa} />
        {sa && (
          <div className="hidden md:block px-3 py-3 border-r bg-muted/20 w-60">
            <Suspense fallback={<div className="h-24 rounded-lg border bg-muted/30 animate-pulse" />}>
              <CreditCounterWidget />
            </Suspense>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header userEmail={user.email || "?"} orgName={org.name} role={role} />
        <main className="flex-1 overflow-y-auto p-6 bg-muted/10">{children}</main>
      </div>
    </div>
  );
}
