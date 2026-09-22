import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ClientBoot from "@/components/life/ClientBoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lfnawa Days",
  description: "Your whole life, one offline-first journal — days, memories, goals, habits, money, and Lfenwa Trades.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F7FB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientBoot />
        {/* No-op everywhere except inside the Capacitor Android shell. Gives
            Android a real "save/share file" path for Export Backup, which a
            bare WebView <a download> cannot do on its own. Same file, byte
            for byte, as the original app/capacitor-bridge.js. */}
        <Script src="/capacitor-bridge.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
