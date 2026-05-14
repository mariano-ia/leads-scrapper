"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptInvitationAction } from "./accept-action";

export function AcceptInvitationButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onAccept() {
    startTransition(async () => {
      const result = await acceptInvitationAction(token);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Te uniste a la org");
      if (result.org_slug) router.push(`/${result.org_slug}/dashboard` as any);
    });
  }

  return (
    <Button onClick={onAccept} disabled={pending} className="w-full">
      {pending && <Loader2 className="h-3 w-3 animate-spin" />}
      Aceptar invitación
    </Button>
  );
}
