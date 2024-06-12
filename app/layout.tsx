import type { Metadata } from "next";
import { Caveat, Poppins, Roboto, Ubuntu } from "next/font/google";
import "./globals.css";

const caveat = Roboto({ subsets: ["greek"], weight: ["100", "300", "400", "500", "700", "900"] });

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
