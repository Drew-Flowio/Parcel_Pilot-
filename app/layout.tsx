import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parcel Pilot — Targeted property leads for PM companies",
  description:
    "A lead-scoring cockpit for property management companies. Find absentee owners, long-vacant buildings, and small-to-mid multifamily targets.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="relative z-10 min-h-screen">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
