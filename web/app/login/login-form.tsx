"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/auth/login"
      method="POST"
      className="space-y-4"
      onSubmit={() => setSubmitting(true)}
    >
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" placeholder="vos@yacare.io" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      {initialError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {initialError}
        </div>
      )}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
