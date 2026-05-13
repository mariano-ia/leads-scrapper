import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leads Scrapper — Yacaré",
  description: "Plataforma de señales de intent sobre PYMEs argentinas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="h-full antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
