// Styled confirmation dialog — replaces window.confirm() with an accessible modal.

import { useEffect, useRef, useCallback } from "react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus cancel button on open
  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  // Escape key closes
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      // Focus trap: tab cycles between cancel and confirm
      if (e.key === "Tab") {
        e.preventDefault();
        if (document.activeElement === cancelRef.current) {
          confirmRef.current?.focus();
        } else {
          cancelRef.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <div style={styles.actions}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={loading}
            style={styles.cancelBtn}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading}
            style={{
              ...styles.confirmBtn,
              background: isDanger ? "#dc2626" : "#2d6b5f",
            }}
          >
            {loading && <span className="spinner" style={{ width: 14, height: 14, marginRight: 6 }} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9000,
    animation: "fadeUp 0.15s ease-out",
  },
  modal: {
    background: "#fff",
    borderRadius: 12,
    padding: "28px 28px 22px",
    maxWidth: 420,
    width: "90%",
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
    animation: "modalEnter 0.2s ease",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 16,
    fontWeight: 700,
    color: "#1a2535",
  },
  message: {
    margin: "0 0 24px",
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.5,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelBtn: {
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid #ddd5cb",
    borderRadius: 6,
    background: "#fff",
    color: "#1a2535",
    cursor: "pointer",
  },
  confirmBtn: {
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
};
