// ClinicalNotesPanel — one note per session. Shows existing note in edit mode or blank create form.

import { useState, useEffect } from "react";
import { getNotesForSession, createNote, updateNote } from "../../api/clinicalNotes";
import type { ClinicalNote } from "../../api/clinicalNotes";

function getAdminName(): string {
  try { const s = localStorage.getItem("admin_name"); if (s) return s; } catch {}
  return "Admin";
}

interface Props {
  sessionId: number;
  patientName: string;
  sessionDate: string;
  onClose: () => void;
}

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ClinicalNotesPanel({ sessionId, patientName, sessionDate, onClose }: Props) {
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state (used for both create and edit)
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState(() => getAdminName());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [sessionId]);

  // Escape key closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !editing) onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, editing]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const notes = await getNotesForSession(sessionId);
      const existing = notes[0] ?? null;
      setNote(existing);
      if (!existing) {
        // No note yet — go straight into create mode
        setContent("");
        setEditing(true);
      }
    } catch {
      setError("Failed to load note.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    setContent(note?.content ?? "");
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setSaveError(null);
    setEditing(false);
    if (!note) onClose(); // No note and user cancels → close panel
  }

  async function handleSave() {
    if (!content.trim()) { setSaveError("Note content cannot be empty."); return; }
    if (!author.trim()) { setSaveError("Please enter your name."); return; }
    setSaving(true);
    setSaveError(null);
    try {
      if (note) {
        const updated = await updateNote(note.id, content.trim());
        setNote(updated);
      } else {
        const created = await createNote(sessionId, content.trim(), author.trim());
        setNote(created);
        try { localStorage.setItem("admin_name", author.trim()); } catch {}
      }
      setEditing(false);
    } catch {
      setSaveError("Failed to save note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }} />

      {/* Slide-in panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: "min(520px, 100vw)",
        background: "#fff", zIndex: 201, display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.14)", animation: "slideInRight 0.22s ease",
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #ede7df", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Session Note</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                {patientName} · {new Date(sessionDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8", padding: "2px 6px", lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {error && (
            <p style={{ fontSize: 12, color: "#dc2626", background: "#fef2f2", padding: "8px 12px", borderRadius: 6, marginBottom: 16 }}>{error}</p>
          )}

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <span className="spinner" />
            </div>
          ) : editing ? (
            /* ── Create / Edit form ── */
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
                {note ? "Edit Note" : "Add Session Note"}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write clinical observations, session summary, treatment plan, or follow-up actions…"
                rows={10}
                autoFocus
                style={{
                  width: "100%", padding: "12px 14px", border: "1px solid #ddd5cb", borderRadius: 8,
                  fontSize: 13, color: "#0F172A", resize: "vertical", fontFamily: "inherit",
                  background: "#fdfbf9", boxSizing: "border-box", lineHeight: 1.7, outline: "none",
                  minHeight: 200,
                }}
              />
              {/* Author field — only show for new notes */}
              {!note && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Written By *</label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Your name"
                    style={{
                      width: "100%", padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6,
                      fontSize: 12, color: "#0F172A", background: "#fdfbf9", boxSizing: "border-box", outline: "none",
                    }}
                  />
                </div>
              )}
              {saveError && (
                <p style={{ fontSize: 11, color: "#dc2626", marginTop: 8 }}>{saveError}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    flex: 1, padding: "9px 0", background: "#3D9E8E", color: "#fff",
                    border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {saving ? "Saving…" : note ? "Update Note" : "Save Note"}
                </button>
                <button
                  onClick={cancelEdit}
                  style={{
                    padding: "9px 18px", background: "#f5f0ea", color: "#64748b",
                    border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : note ? (
            /* ── View note ── */
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Session Note</span>
                <button
                  onClick={startEdit}
                  style={{
                    padding: "5px 14px", background: "#f0faf8", color: "#3D9E8E",
                    border: "1px solid #c5e8e2", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  ✏️ Edit Note
                </button>
              </div>
              <div style={{
                background: "#fdfbf9", border: "1px solid #ede7df", borderRadius: 10,
                padding: "16px 18px",
              }}>
                <p style={{ margin: 0, fontSize: 13, color: "#0F172A", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                  {note.content}
                </p>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8" }}>
                Written by <strong style={{ color: "#64748b" }}>{note.createdByName}</strong> · {fmtDT(note.createdAt)}
                {note.updatedAt !== note.createdAt && <span style={{ marginLeft: 6, color: "#3D9E8E", fontStyle: "italic" }}>edited {fmtDT(note.updatedAt)}</span>}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
