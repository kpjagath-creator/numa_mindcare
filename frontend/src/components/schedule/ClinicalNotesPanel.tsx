// ClinicalNotesPanel — one note per session. Shows existing note in edit mode or blank create form.

import { useState, useEffect } from "react";
import { getNotesForSession, createNote, updateNote, signNote, addAmendment } from "../../api/clinicalNotes";
import type { ClinicalNote } from "../../api/clinicalNotes";
import { useAuth } from "../../auth/AuthContext";

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
  const { hasPermission } = useAuth();
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state (used for both create and edit)
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState(() => getAdminName());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sign-off (CLN-07)
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [confirmingSign, setConfirmingSign] = useState(false);

  // Amendments (CLN-07) — only meaningful once the note is signed
  const [addingAmendment, setAddingAmendment] = useState(false);
  const [amendmentContent, setAmendmentContent] = useState("");
  const [amendmentAuthor, setAmendmentAuthor] = useState(() => getAdminName());
  const [savingAmendment, setSavingAmendment] = useState(false);
  const [amendmentError, setAmendmentError] = useState<string | null>(null);

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
    if (note?.status === "signed") return; // signed notes are immutable — edit via amendment instead
    setContent(note?.content ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function handleSign() {
    if (!note) return;
    setSigning(true);
    setSignError(null);
    try {
      const signed = await signNote(note.id, getAdminName());
      setNote(signed);
      setConfirmingSign(false);
    } catch (err: any) {
      setSignError(err?.response?.data?.error?.message ?? "Failed to sign note. Please try again.");
    } finally {
      setSigning(false);
    }
  }

  async function handleAddAmendment() {
    if (!note) return;
    if (!amendmentContent.trim()) { setAmendmentError("Amendment content cannot be empty."); return; }
    if (!amendmentAuthor.trim()) { setAmendmentError("Please enter your name."); return; }
    setSavingAmendment(true);
    setAmendmentError(null);
    try {
      const updated = await addAmendment(note.id, amendmentContent.trim(), amendmentAuthor.trim());
      setNote(updated);
      try { localStorage.setItem("admin_name", amendmentAuthor.trim()); } catch {}
      setAmendmentContent("");
      setAddingAmendment(false);
    } catch (err: any) {
      setAmendmentError(err?.response?.data?.error?.message ?? "Failed to add amendment. Please try again.");
    } finally {
      setSavingAmendment(false);
    }
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Session Note</span>
                  {note.status === "signed" ? (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#ecfdf5", color: "#047857", borderRadius: 4, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      🔒 Signed
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#fffbeb", color: "#b45309", borderRadius: 4, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Draft
                    </span>
                  )}
                </div>
                {note.status === "draft" && (
                  <button
                    onClick={startEdit}
                    style={{
                      padding: "5px 14px", background: "#f0faf8", color: "#3D9E8E",
                      border: "1px solid #c5e8e2", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    ✏️ Edit Note
                  </button>
                )}
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
                {note.status === "draft" && note.updatedAt !== note.createdAt && <span style={{ marginLeft: 6, color: "#3D9E8E", fontStyle: "italic" }}>edited {fmtDT(note.updatedAt)}</span>}
                {note.status === "signed" && note.signedAt && (
                  <span style={{ marginLeft: 6, color: "#047857" }}>
                    · Signed by <strong>{note.signedByName}</strong> · {fmtDT(note.signedAt)}
                  </span>
                )}
              </div>

              {/* Sign-off action (CLN-07) — drafts only, permission-gated */}
              {note.status === "draft" && hasPermission("clinical_notes:sign") && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ede7df" }}>
                  {signError && <p style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{signError}</p>}
                  {confirmingSign ? (
                    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#92400e" }}>
                        Signing locks this note permanently — it can no longer be edited or deleted. Further changes will be recorded as amendments.
                      </p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={handleSign}
                          disabled={signing}
                          style={{ padding: "7px 16px", background: "#047857", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          {signing ? "Signing…" : "Confirm & Sign"}
                        </button>
                        <button
                          onClick={() => setConfirmingSign(false)}
                          style={{ padding: "7px 16px", background: "#f5f0ea", color: "#64748b", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingSign(true)}
                      style={{ padding: "7px 16px", background: "#047857", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      🔒 Sign Note
                    </button>
                  )}
                </div>
              )}

              {/* Amendment history + add-amendment form (CLN-07) — signed notes only */}
              {note.status === "signed" && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #ede7df" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Amendments {note.amendments.length > 0 ? `(${note.amendments.length})` : ""}
                  </span>

                  {note.amendments.map((a) => (
                    <div key={a.id} style={{ marginTop: 10, background: "#f7fbfa", border: "1px solid #d9ece7", borderRadius: 8, padding: "12px 14px" }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#0F172A", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.content}</p>
                      <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8" }}>
                        <strong style={{ color: "#64748b" }}>{a.createdByName}</strong> · {fmtDT(a.createdAt)}
                      </div>
                    </div>
                  ))}

                  {hasPermission("clinical_notes:update") && (
                    addingAmendment ? (
                      <div style={{ marginTop: 12 }}>
                        <textarea
                          value={amendmentContent}
                          onChange={(e) => setAmendmentContent(e.target.value)}
                          placeholder="Add a follow-up amendment…"
                          rows={4}
                          autoFocus
                          style={{
                            width: "100%", padding: "10px 12px", border: "1px solid #ddd5cb", borderRadius: 8,
                            fontSize: 13, color: "#0F172A", resize: "vertical", fontFamily: "inherit",
                            background: "#fdfbf9", boxSizing: "border-box", lineHeight: 1.6, outline: "none",
                          }}
                        />
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4 }}>Written By *</label>
                          <input
                            type="text"
                            value={amendmentAuthor}
                            onChange={(e) => setAmendmentAuthor(e.target.value)}
                            placeholder="Your name"
                            style={{
                              width: "100%", padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6,
                              fontSize: 12, color: "#0F172A", background: "#fdfbf9", boxSizing: "border-box", outline: "none",
                            }}
                          />
                        </div>
                        {amendmentError && <p style={{ fontSize: 11, color: "#dc2626", marginTop: 8 }}>{amendmentError}</p>}
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button
                            onClick={handleAddAmendment}
                            disabled={savingAmendment}
                            style={{ flex: 1, padding: "8px 0", background: "#3D9E8E", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            {savingAmendment ? "Saving…" : "Save Amendment"}
                          </button>
                          <button
                            onClick={() => { setAddingAmendment(false); setAmendmentError(null); }}
                            style={{ padding: "8px 16px", background: "#f5f0ea", color: "#64748b", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingAmendment(true)}
                        style={{ marginTop: 10, padding: "6px 14px", background: "#fff", color: "#3D9E8E", border: "1px solid #c5e8e2", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >
                        + Add Amendment
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
