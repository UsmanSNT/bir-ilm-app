import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./discovery.css";
import "./mobile-screens.css";
import "./mobile-library.css";
import "./profile-screens.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f7f5",
};

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
