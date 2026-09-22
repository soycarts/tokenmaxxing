import type { Metadata, Viewport } from "next";
import { Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { siteUrl } from "@/lib/env";
import "./globals.css";

const text = Schibsted_Grotesk({ variable: "--font-text", subsets: ["latin"], display: "swap" });
const num = Martian_Mono({ variable: "--font-num", subsets: ["latin"], display: "swap", axes: ["wdth"] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "tokenmaxxing: what your AI subscription actually delivered", template: "%s | tokenmaxxing" },
  description:
    "Paste one prompt into your coding agent. It reads your local agent logs and prices your usage at API list rates. Subscribers usually find out they are getting a very good deal.",
};

export const viewport: Viewport = { themeColor: "#141a2b", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${text.variable} ${num.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
