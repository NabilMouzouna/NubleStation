import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NubleStation Console",
  description: "Private cloud infrastructure admin dashboard",
};

// Server component reads the theme cookie so the correct class is on <html>
// before React hydrates — no mismatch, no class strip on navigation.
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("nuble-theme")?.value ?? "dark";
  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
