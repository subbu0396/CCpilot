import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CCpilot — Customer Intelligence",
  description: "Drop reviews, analyze themes, pain points, churn, and roadmap in one place",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background`}>
        <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-2.5 lg:px-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
                CC
              </span>
              <span className="font-semibold text-foreground">CCpilot</span>
            </Link>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Customer intelligence copilot
            </p>
          </div>
        </header>
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
      </body>
    </html>
  );
}
