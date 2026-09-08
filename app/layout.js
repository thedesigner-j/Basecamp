import "./globals.css";

export const metadata = {
  title: "Basecamp — FX Swing Setups",
  description: "Consolidation-zone based swing trade setups for major FX pairs.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
