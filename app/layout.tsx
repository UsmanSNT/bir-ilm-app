import PwaRegister from "./pwa-register";
import { InstallHelp } from "./install-app";
import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/caveat";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./discovery.css";
import "./mobile-screens.css";
import "./mobile-library.css";
import "./profile-screens.css";
import "./community/community.css";
import "./talks.css";
import "./store.css";
import "./naqsh.css";
import "./quiz.css";
import "./quiz-game.css";
import "./wisdom.css";
import "./profile-v2.css";
import "./live-room.css";
import "./ebook.css";
import "./about.css";
import "./install-app.css";

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
    icon: [{ url: "/assets/bir-ilm-logo.jpg", type: "image/jpeg" }],
    shortcut: "/assets/bir-ilm-logo.jpg",
    apple: "/assets/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Klaviatura ochilganda sahifa qisqaradi, pastki panel (izoh) klaviatura ustida qoladi.
  interactiveWidget: "resizes-content",
  themeColor: "#f7f1e4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz">
      <body className="antialiased">{children}<PwaRegister /><InstallHelp /></body>
    </html>
  );
}
