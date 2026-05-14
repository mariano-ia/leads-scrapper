import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Globe2, Shield, ArrowLeft } from "lucide-react";
import { requireAuth, isSuperAdmin } from "@/lib/auth";
import { Header } from "@/components/header";
import { CreditCounterWidget } from "@/components/credit-counter";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const sa = await isSuperAdmin(user.id);
  if (!sa) redirect("/");

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden md:flex w-60 flex-col border-r bg-muted/20">
        <div className="px-4 py-4 border-b">
          <Link href="/admin/orgs">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Super-admin
            </div>
            <div className="text-xs text-muted-foreground">Panel global</div>
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3 text-sm">
          <Link href="/admin/orgs" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
            <Building2 className="h-4 w-4" /> Orgs
          </Link>
          <Link href="/admin/universe" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
            <Globe2 className="h-4 w-4" /> Master universe
          </Link>
          <Link href="/admin/usage" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
            <Shield className="h-4 w-4" /> Apollo usage
          </Link>
          <div className="pt-3 mt-3 border-t" />
          <Link href="/" className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver a la app
          </Link>
        </nav>
        <div className="px-3 py-3 border-t">
          <CreditCounterWidget />
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header userEmail={user.email || "?"} orgName="Super-admin" role="admin" />
        <main className="flex-1 overflow-y-auto p-6 bg-muted/10">{children}</main>
      </div>
    </div>
  );
}
