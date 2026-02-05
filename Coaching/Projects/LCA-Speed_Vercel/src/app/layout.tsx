import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./page-background.css";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import { ThemeBar } from "@/app/components/ThemeBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LCA Speed Journal",
  description: "Track & field and strength data — live leaderboards, athlete management",
};

const themeScript =
  "(function(){var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)');d.classList.toggle('dark',m.matches);})();";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}
      >
        <ThemeProvider>
          <ThemeBar>{children}</ThemeBar>
        </ThemeProvider>
      </body>
    </html>
  );
}
