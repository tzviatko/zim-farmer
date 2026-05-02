import type { Metadata, Viewport } from "next";
import { Urbanist, DM_Mono } from "next/font/google";
import SwRegister from "./sw-register";
import "./globals.css";

const urbanist = Urbanist({
  variable: "--font-syne",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ZIM FARMER",
  description: "Cattle registry",
};

export const viewport: Viewport = {
  themeColor: "#3B6D11",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${urbanist.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
