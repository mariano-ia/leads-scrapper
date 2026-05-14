import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewSearchForm } from "./new-search-form";

export default function NewSearchPage({ params }: { params: { org_slug: string } }) {
  return (
    <div className="space-y-4">
      <Link href={`/${params.org_slug}/searches`}>
        <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /> Volver</Button>
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Nueva search</h1>
        <p className="text-sm text-muted-foreground">Definí qué empresas querés ver en tu radar</p>
      </div>
      <NewSearchForm orgSlug={params.org_slug} />
    </div>
  );
}
