import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leads Scrapper — Yacaré",
  description: "Plataforma multi-tenant de señales de intent sobre PYMEs argentinas",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
