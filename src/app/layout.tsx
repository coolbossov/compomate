import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
