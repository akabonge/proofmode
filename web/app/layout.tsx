import "./globals.css";
import AnalyticsTracker from "./analytics-tracker";

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
      <body>
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
