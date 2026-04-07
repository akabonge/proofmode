"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { trackPageView } from "@/lib/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
