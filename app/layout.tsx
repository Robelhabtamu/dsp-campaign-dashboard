import Link from "next/link";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "DSP Campaign Analytics",
  description: "Campaign performance, budget scenarios and auction analysis",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900">
          <div className="mx-auto max-w-7xl px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link href="/" className="text-xl font-bold text-cyan-300">
                DSP Campaign Analytics
              </Link>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                Historical analysis · June 6–12, 2013
              </span>
            </div>

            <nav aria-label="Main navigation" className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-800"
              >
                Performance
              </Link>
              <Link
                href="/pacing"
                className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-800"
              >
                Budget &amp; Pacing
              </Link>
              <span className="px-4 py-2 text-slate-500">
                Auction insights · coming next
              </span>
            </nav>
          </div>
        </header>

        {children}

        <footer className="mx-auto w-full max-w-7xl px-5 py-6 text-xs text-slate-400">
          Historical dataset. Automatic hourly replay is not enabled yet.
          Prices and costs use scaled dataset units.
        </footer>
      </body>
    </html>
  );
}