import type { Metadata } from "next";
import "./globals.css";
import { Geist, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const isVercelRuntime =
  process.env.VERCEL === "1" ||
  process.env.VERCEL === "true" ||
  Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);

export const metadata: Metadata = {
  title: "CompoMate",
  description: "Composite workflow MVP for dance and gymnastics photography.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable, inter.variable)}>
      <head>
        <link rel="preconnect" href="https://us.i.posthog.com" />
        {isVercelRuntime ? (
          <link rel="preconnect" href="https://vitals.vercel-insights.com" />
        ) : null}
      </head>
      <body className="antialiased">
        <PostHogProvider>
          {children}
        </PostHogProvider>
        <Toaster />
        {isVercelRuntime ? <Analytics /> : null}
        {isVercelRuntime ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
