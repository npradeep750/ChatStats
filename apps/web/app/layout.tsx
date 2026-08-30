import { Space_Grotesk, Inter } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./styles.css";
import "./picker.css";
import "./deck-fix.css";
import "./landing.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata = {
  title: "Chat Stats",
  description: "Your group chat, delightfully analyzed.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${inter.variable}`}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </body>
    </html>
  );
}