import "./globals.css";

export const metadata = {
  title: "ProofMode",
  description: "Show your work in the AI era.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}