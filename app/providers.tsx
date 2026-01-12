"use client";

import { ToastProvider } from "../lib/useToast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
