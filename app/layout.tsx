import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { FilterProvider } from "@/lib/filters/context";
import { SidebarNav } from "@/components/dashboard/SidebarNav";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { DashboardProvider } from "@/components/dashboard/DashboardProvider";
import { ViewProvider } from "@/components/dashboard/ViewProvider";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CCPilot — Customer Intelligence Copilot",
  description:
    "Unified feedback intelligence across Play Store and support tickets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-[#f7f5f1] font-sans text-slate-900 antialiased">
        <FilterProvider>
          <DashboardProvider>
            <ViewProvider>
              <div className="flex min-h-screen">
                <SidebarNav />
                <div className="flex min-w-0 flex-1 flex-col">
                  <FilterBar />
                  <main className="flex-1">{children}</main>
                </div>
              </div>
            </ViewProvider>
          </DashboardProvider>
        </FilterProvider>
      </body>
    </html>
  );
}
