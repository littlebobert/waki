import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Waki — Ideas, made present",
  description: "A quiet meeting companion that turns conversation into working software.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
