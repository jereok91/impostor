import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Impostor Game",
  description: "Descubre quién miente antes de que sea tarde. Juego multijugador en tiempo real.",
  keywords: ["impostor", "juego", "multijugador", "party game", "deducción"],
  authors: [{ name: "Digitalgex" }],
  creator: "Digitalgex Team",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Impostor",
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "https://impostor.digitalgex.com",
    title: "Impostor Game",
    description: "Descubre quién miente antes de que sea tarde",
    siteName: "Impostor Game",
  },
  twitter: {
    card: "summary_large_image",
    title: "Impostor Game",
    description: "Descubre quién miente antes de que sea tarde",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
