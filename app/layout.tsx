import type { Metadata } from "next";
import { Caveat, Poppins, Ubuntu } from "next/font/google";
import "./globals.css";

const caveat = Ubuntu({ subsets: ["greek"], weight: ["300", "400", "500", "700"] });

export const metadata: Metadata = {
    title: "NLP Testbed",
    description: "Powered by Overengineered!",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={caveat.className}>{children}</body>
        </html>
    );
}
