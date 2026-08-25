import "./styles.css";
import "./picker.css";
import "./deck-fix.css";

export const metadata = { title: "Chat Stats", description: "Your group chat, delightfully analyzed." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
