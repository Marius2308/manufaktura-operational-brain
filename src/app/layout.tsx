import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MANUFAKTURA",
  description: "AI decision support for multi-location restaurant operations",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 text-zinc-900" suppressHydrationWarning>
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="MANUFAKTURA" width={28} height={28} className="h-7 w-7 object-contain" priority unoptimized />
              <span className="text-sm font-bold tracking-tight">MANUFAKTURA</span>
            </Link>
            <nav className="flex gap-4 text-sm text-zinc-600">
              <Link href="/" className="hover:text-zinc-900">Overview</Link>
              <Link href="/actions" className="hover:text-zinc-900">Actions</Link>
              <Link href="/import" className="hover:text-zinc-900">Import</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
