// Toast notification system — provides context + hook for showing auto-dismissing toasts.

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";

type ToastType = "success" | "error" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON: Record<ToastType, string> = { success: "\u2713", error: "\u2715", warning: "\u26A0" };
const COLOR: Record<ToastType, string> = { success: "#3D9E8E", error: "#DC2626", warning: "#D97706" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => {
      const next = [...prev, { id, message, type, visible: true }];
      // Keep max 3
      return next.length > 3 ? next.slice(next.length - 3) : next;
    });

    // Start fade-out at 3s
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    }, 3000);

    // Remove at 3.5s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div style={styles.container}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const color = COLOR[toast.type];

  return (
    <div
      style={{
        ...styles.toast,
        borderLeftColor: color,
        opacity: mounted && toast.visible ? 1 : 0,
        transform: mounted && toast.visible ? "translateX(0)" : "translateX(20px)",
      }}
      role="alert"
    >
      <span style={{ ...styles.icon, color }}>{ICON[toast.type]}</span>
      <span style={styles.message}>{toast.message}</span>
      <button
        onClick={onClose}
        style={styles.close}
        aria-label="Close notification"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    pointerEvents: "none",
  },
  toast: {
    pointerEvents: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    background: "#fff",
    borderRadius: 12,
    borderLeft: "4px solid",
    boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
    minWidth: 340,
    maxWidth: 420,
    transition: "opacity 0.3s ease, transform 0.3s ease",
  },
  icon: {
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
    width: 18,
    textAlign: "center",
  },
  message: {
    fontSize: 13,
    color: "#0F172A",
    flex: 1,
    lineHeight: 1.4,
  },
  close: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
    flexShrink: 0,
  },
};
