import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/login/actions";
import { initials } from "@/lib/utils";
import { LogOut } from "lucide-react";

interface HeaderProps {
  userEmail: string;
  orgName: string;
  role: "admin" | "member";
}

export function Header({ userEmail, orgName, role }: HeaderProps) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6 bg-background">
      <div>
        <div className="text-sm font-medium">{orgName}</div>
        <div className="text-xs text-muted-foreground">{role}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm">{userEmail}</div>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback>{initials(userEmail)}</AvatarFallback>
        </Avatar>
        <form action={logoutAction}>
          <Button variant="ghost" size="icon" type="submit" title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
