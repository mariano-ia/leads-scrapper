import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getUserOrgs, isSuperAdmin } from "@/lib/auth";

export default async function SelectOrgPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrgs(user.id);
  const sa = await isSuperAdmin(user.id);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Elegí una organización</CardTitle>
          <CardDescription>Sos miembro de {orgs.length} organización{orgs.length !== 1 ? "es" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {orgs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No pertenecés a ninguna organización todavía. Pedile a un admin que te invite.
            </p>
          )}
          {orgs.map((m: any) => (
            <Link key={m.orgs.id} href={`/${m.orgs.slug}/dashboard`}>
              <Button variant="outline" className="w-full justify-between">
                <span>{m.orgs.name}</span>
                <span className="text-xs text-muted-foreground">{m.role}</span>
              </Button>
            </Link>
          ))}
          {sa && (
            <Link href="/admin/orgs">
              <Button variant="ghost" className="w-full">Panel super-admin</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
