import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ChatPanel from "@/components/ChatPanel";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeadBase — Sales Intelligence Platform | 1.4M+ Verified Leads",
  description: "Find your top 1% leads with proof, not guesses. AI-powered ICP builder, lead scoring, deliverability guardrails, and verified contact data. Speed is the brand.",
  keywords: ["sales intelligence", "lead generation", "B2B leads", "email verification", "ICP builder", "lead scoring"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <ChatPanel />
      </body>
    </html>
  );
}
