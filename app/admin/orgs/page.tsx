import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function AdminOrgsPage() {
  const svc = createSupabaseServiceClient();

  const { data: orgs } = await svc.from("orgs").select("*").order("created_at", { ascending: false });

  // Members count per org
  const orgIds = (orgs || []).map((o) => o.id);
  const membersByOrg = new Map<string, number>();
  for (const id of orgIds) {
    const { count } = await svc.from("org_members").select("*", { count: "exact", head: true }).eq("org_id", id);
    membersByOrg.set(id, count || 0);
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold">Organizaciones</h1>
          <p className="text-sm text-muted-foreground">Todas las orgs del sistema</p>
        </div>
        <Button disabled>Crear nueva org (próximo)</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Miembros</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs?.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{o.slug}</TableCell>
                <TableCell><Badge variant="secondary">{membersByOrg.get(o.id) || 0}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                <TableCell>
                  <Link href={`/${o.slug}/dashboard`}>
                    <Button variant="ghost" size="sm">Entrar</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
