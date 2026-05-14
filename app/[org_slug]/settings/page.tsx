import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { requireAuth, requireOrgMembership } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export default async function SettingsPage({ params }: { params: { org_slug: string } }) {
  const user = await requireAuth();
  const { org } = await requireOrgMembership(params.org_slug, user.id);
  const currentName = ((user.user_metadata as any)?.full_name as string) || "";

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configuración de la org y tu perfil</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tu perfil</CardTitle>
          <CardDescription>Cómo aparecés en owner selects, notas y outreach</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm orgSlug={org.slug} currentName={currentName} currentEmail={user.email || ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Organización</CardTitle><CardDescription>Solo lectura por ahora</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input defaultValue={org.name} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Slug</Label>
            <Input defaultValue={org.slug} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>ID</Label>
            <Input defaultValue={org.id} disabled className="font-mono text-xs" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
