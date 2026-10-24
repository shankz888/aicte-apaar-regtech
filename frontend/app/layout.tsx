import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { GlobalEffects } from "@/components/backgrounds/global-effects";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "APAAR RegTech | AICTE | SIH 2026",
  description: "A secure regulatory workspace for enrolment validation, intake compliance and privacy-preserving verification.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <GlobalEffects />
        {children}
      </body>
    </html>
  );
}






