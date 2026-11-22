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
      <body className="min-h-full bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-5 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xl font-bold text-blue-700">
                DSP Campaign Analytics
              </span>
              <span className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600">
                Historical analysis · June 6–12, 2013
              </span>
            </div>
          </div>
        </header>

        {children}

        <footer className="mx-auto w-full max-w-7xl px-5 py-6 text-xs text-slate-500">
          Historical dataset. Automatic hourly replay is not enabled yet. Prices
          and costs use scaled dataset units.
        </footer>
      </body>
    </html>
  );
}
