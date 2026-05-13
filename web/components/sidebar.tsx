"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Search,
  Globe2,
  Users,
  Settings,
  Bell,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  orgSlug: string;
  orgName: string;
  role: "admin" | "member";
  isSuperAdmin?: boolean;
}

export function Sidebar({ orgSlug, orgName, role, isSuperAdmin }: SidebarProps) {
  const pathname = usePathname();
  const base = `/${orgSlug}`;

  const navItems = [
    { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `${base}/companies`, label: "Companies", icon: Building2 },
    { href: `${base}/searches`, label: "Searches", icon: Search },
    { href: `${base}/alerts`, label: "Alerts", icon: Bell },
    { href: `${base}/universe`, label: "Universe target", icon: Globe2 },
  ];

  const adminItems = [
    { href: `${base}/members`, label: "Members", icon: Users },
    { href: `${base}/settings`, label: "Settings", icon: Settings },
  ];

  const superAdminItems = [
    { href: `/admin/orgs`, label: "All orgs", icon: Building2 },
    { href: `/admin/universe`, label: "Master universe", icon: Globe2 },
    { href: `/admin/usage`, label: "Apollo usage", icon: Shield },
  ];

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-muted/20">
      <div className="px-4 py-4 border-b">
        <Link href={`${base}/dashboard`}>
          <div className="font-semibold text-sm">{orgName}</div>
          <div className="text-xs text-muted-foreground">Leads Scrapper</div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3 text-sm">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors",
              pathname.startsWith(href) && "bg-accent text-accent-foreground font-medium"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        {role === "admin" && (
          <>
            <div className="pt-3 mt-3 border-t" />
            <div className="px-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">Admin org</div>
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors",
                  pathname.startsWith(href) && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="pt-3 mt-3 border-t" />
            <div className="px-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">Super-admin</div>
            {superAdminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors",
                  pathname.startsWith(href) && "bg-accent text-accent-foreground font-medium"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}
