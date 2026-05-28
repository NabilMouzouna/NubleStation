import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NubleStation Console",
  description: "Private cloud infrastructure admin dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script runs before paint to apply saved theme and avoid FOUC */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(localStorage.getItem('nuble-theme')!=='light')document.documentElement.classList.add('dark');}catch(e){}})();` }} />
      </head>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
