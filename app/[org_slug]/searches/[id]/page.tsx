import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { EditSearchForm } from "./edit-form";

export default async function EditSearchPage({
  params,
}: {
  params: { org_slug: string; id: string };
}) {
  const user = await requireAuth();
  const { org, role } = await requireOrgMembership(params.org_slug, user.id);
  const svc = createSupabaseServiceClient();

  const { data: search } = await svc
    .from("searches")
    .select("*")
    .eq("id", params.id)
    .eq("org_id", org.id)
    .maybeSingle();

  if (!search) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/${params.org_slug}/searches`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Editar search</h1>
        <p className="text-sm text-muted-foreground">{search.name}</p>
      </div>
      <EditSearchForm orgSlug={params.org_slug} searchId={search.id} initial={search} canDelete={role === "admin"} />
    </div>
  );
}
