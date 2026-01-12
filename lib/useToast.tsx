"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const toast: Toast = { id, message, type, duration };
    
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const error = useCallback((message: string) => showToast(message, "error", 5000), [showToast]);
  const info = useCallback((message: string) => showToast(message, "info"), [showToast]);
  const warning = useCallback((message: string) => showToast(message, "warning"), [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, warning, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// Componente de Toast individual
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const styles: Record<ToastType, { bg: string; border: string; icon: string; text: string }> = {
    success: {
      bg: "bg-emerald-950/90",
      border: "border-emerald-500/50",
      icon: "✓",
      text: "text-emerald-300",
    },
    error: {
      bg: "bg-rose-950/90",
      border: "border-rose-500/50",
      icon: "✕",
      text: "text-rose-300",
    },
    info: {
      bg: "bg-sky-950/90",
      border: "border-sky-500/50",
      icon: "ℹ",
      text: "text-sky-300",
    },
    warning: {
      bg: "bg-amber-950/90",
      border: "border-amber-500/50",
      icon: "⚠",
      text: "text-amber-300",
    },
  };

  const style = styles[toast.type];

  return (
    <div
      className={`
        ${style.bg} ${style.border} border rounded-lg px-4 py-3 shadow-xl
        backdrop-blur-sm flex items-center gap-3 min-w-[280px] max-w-md
        animate-slide-in-right
      `}
      style={{
        animation: "slideInRight 0.3s ease-out",
      }}
    >
      <span className={`${style.text} text-lg font-bold flex-shrink-0`}>
        {style.icon}
      </span>
      <p className="text-slate-200 text-sm flex-1">{toast.message}</p>
      <button
        onClick={onRemove}
        className="text-slate-400 hover:text-slate-200 transition flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

// Contenedor de Toasts
function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// CSS animations (agregar al globals.css)
export const toastAnimationStyles = `
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
`;
