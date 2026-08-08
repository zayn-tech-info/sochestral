import type { Metadata, Viewport } from "next";
import { Imprima, Inter, Sora } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const imprima = Imprima({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-imprima",
});

export const metadata: Metadata = {
  title: "Sochestral | Your AI Social Media Studio",
  description:
    "Sochestral turns business knowledge into a consistent, strategic, authentic online presence through a careful conversational workspace.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${sora.variable} ${imprima.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
