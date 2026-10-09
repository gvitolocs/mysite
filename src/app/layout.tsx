import type { Metadata } from "next";
import { Geist, Geist_Mono, Syne } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gvitolo.vercel.app"),
  title: "Giuseppe Vitolo | Software Engineer · Backend & Data",
  description:
    "Giuseppe Vitolo, Computer Engineering MSc student in Aarhus. Rust, PostgreSQL, Kubernetes and React projects, including Pokoin, CardRail and B2B product-data tools.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Giuseppe Vitolo | Software Engineer · Backend & Data",
    description:
      "Backend systems, data pipelines and web products. Explore Pokoin, CardRail and my B2B work at prduct.",
    type: "website",
    url: "/",
    images: [{ url: "/giuseppe-vitolo.jpg", width: 499, height: 499, alt: "Giuseppe Vitolo" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${syne.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
