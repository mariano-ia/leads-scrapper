"use client";

import { useState } from "react";
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
  Radar,
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/${orgSlug}`;

  const navItems = [
    { href: `${base}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `${base}/radar`, label: "Radar", icon: Radar },
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

  function renderNavLink(item: { href: string; label: string; icon: any }) {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent transition-colors",
          pathname.startsWith(item.href) && "bg-accent text-accent-foreground font-medium"
        )}
      >
        <Icon className="h-4 w-4" />
        {item.label}
      </Link>
    );
  }

  const navContent = (
    <>
      <div className="px-4 py-4 border-b">
        <Link href={`${base}/dashboard`} onClick={() => setMobileOpen(false)}>
          <div className="font-semibold text-sm">{orgName}</div>
          <div className="text-xs text-muted-foreground">Leads Scrapper</div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-3 text-sm overflow-y-auto">
        {navItems.map(renderNavLink)}

        {role === "admin" && (
          <>
            <div className="pt-3 mt-3 border-t" />
            <div className="px-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">Admin org</div>
            {adminItems.map(renderNavLink)}
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="pt-3 mt-3 border-t" />
            <div className="px-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">Super-admin</div>
            {superAdminItems.map(renderNavLink)}
          </>
        )}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile top bar (visible <md) */}
      <div className="md:hidden flex items-center justify-between border-b px-4 py-3 bg-background sticky top-0 z-30">
        <button
          aria-label="Abrir menú"
          onClick={() => setMobileOpen(true)}
          className="p-1 rounded-md hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="font-semibold text-sm">{orgName}</div>
        <div className="w-7" /> {/* spacer */}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          />
          <aside className="relative w-64 bg-background border-r flex flex-col h-full">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1 rounded-md hover:bg-accent"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
            {navContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col border-r bg-muted/20">
        {navContent}
      </aside>
    </>
  );
}
