import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { AcceptInvitationButton } from "./accept-button";

export default async function InvitationLandingPage({ params }: { params: { token: string } }) {
  const svc = createSupabaseServiceClient();
  const { data: invitation } = await svc
    .from("invitations")
    .select("id, org_id, email, role, expires_at, accepted_at, orgs(slug, name)")
    .eq("token", params.token)
    .maybeSingle();

  if (!invitation) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Invitación inválida</CardTitle>
            <CardDescription>El link que recibiste no existe o fue cancelado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login"><Button variant="outline" size="sm">Ir al login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invitation.accepted_at) {
    const orgSlug = (invitation.orgs as any)?.slug;
    if (orgSlug) redirect(`/${orgSlug}/dashboard`);
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Invitación ya aceptada</CardTitle>
            <CardDescription>Esta invitación fue usada anteriormente.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login"><Button variant="outline" size="sm">Ir al login</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const expired = new Date(invitation.expires_at as string) < new Date();
  if (expired) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Invitación expirada</CardTitle>
            <CardDescription>Esta invitación venció el {new Date(invitation.expires_at as string).toLocaleDateString()}. Pedile al admin que te invite de nuevo.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const currentUser = await getCurrentUser();
  const orgName = (invitation.orgs as any)?.name || "una organización";

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Invitación a {orgName}</CardTitle>
            <CardDescription>
              Para aceptar la invitación necesitás una cuenta con email <span className="font-medium">{invitation.email}</span>.
              Iniciá sesión o registrate primero.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href={`/login?next=/invitations/${params.token}`}>
              <Button size="sm">Iniciar sesión</Button>
            </Link>
            <Link href={`/signup?email=${encodeURIComponent(invitation.email as string)}&next=/invitations/${params.token}`}>
              <Button size="sm" variant="outline">Crear cuenta</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Usuario logueado pero con email distinto al invitado
  if ((currentUser.email || "").toLowerCase() !== (invitation.email as string).toLowerCase()) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Email no coincide</CardTitle>
            <CardDescription>
              Estás logueado como <span className="font-medium">{currentUser.email}</span> pero la
              invitación es para <span className="font-medium">{invitation.email}</span>. Cerrá sesión
              y entrá con la cuenta correcta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/api/auth/logout?next=/invitations/${params.token}`}>
              <Button size="sm" variant="outline">Cerrar sesión</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Invitación a {orgName}</CardTitle>
          <CardDescription>
            Vas a unirte como <span className="font-medium">{invitation.role}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInvitationButton token={params.token} />
        </CardContent>
      </Card>
    </div>
  );
}
