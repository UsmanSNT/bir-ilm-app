import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/manrope";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bir Ilm — kitobxonlik ilovasi",
  description: "Har hafta bitta kitob. Chat, jonli suhbat, javon, reyting va streak bir joyda.",
  other: {
    "codex-preview": "development",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Bir Ilm",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/assets/bir-ilm-logo.jpg",
  },
};

export const viewport: Viewport = { themeColor: "#1E2F6E" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}</body>
    </html>
  );
}
