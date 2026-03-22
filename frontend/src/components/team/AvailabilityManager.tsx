// Availability manager — weekly schedule + blockout dates for a therapist.

import { useState, useEffect } from "react";
import { getAvailability, setAvailability, getBlockouts, createBlockout, deleteBlockout } from "../../api/availability";
import type { AvailabilitySlot, BlockoutEntry } from "../../api/availability";
import ConfirmDialog from "../ui/ConfirmDialog";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

interface DaySlot {
  dayOfWeek: number;
  active: boolean;
  startTime: string;
  endTime: string;
}

interface Props {
  therapistId: number;
}

export default function AvailabilityManager({ therapistId }: Props) {
  const [slots, setSlots] = useState<DaySlot[]>(
    Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      active: DEFAULT_WORKING_DAYS.includes(i),
      startTime: "09:00",
      endTime: "18:00",
    }))
  );
  const [blockouts, setBlockouts] = useState<BlockoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Blockout form
  const [newBlockDate, setNewBlockDate] = useState("");
  const [newBlockReason, setNewBlockReason] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [deleteBlockId, setDeleteBlockId] = useState<number | null>(null);

  useEffect(() => {
    void load();
  }, [therapistId]);

  async function load() {
    setLoading(true);
    try {
      const [existingSlots, existingBlockouts] = await Promise.all([
        getAvailability(therapistId),
        getBlockouts(therapistId),
      ]);
      // Merge existing slots into the 7-day grid
      setSlots(prev => prev.map(day => {
        const existing = existingSlots.find((s: AvailabilitySlot) => s.dayOfWeek === day.dayOfWeek);
        if (existing) return { ...day, active: true, startTime: existing.startTime.slice(0, 5), endTime: existing.endTime.slice(0, 5) };
        return { ...day, active: false };
      }));
      setBlockouts(existingBlockouts);
    } catch {
      // silently fail — show defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSlots() {
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    try {
      const activeSlots = slots
        .filter(d => d.active)
        .map(d => ({ day_of_week: d.dayOfWeek, start_time: d.startTime, end_time: d.endTime }));
      await setAvailability(therapistId, activeSlots);
      setSaveMsg("Availability saved.");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveError("Failed to save availability.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBlockout() {
    if (!newBlockDate) { setBlockError("Date is required."); return; }
    setBlockError(null);
    setAddingBlock(true);
    try {
      const entry = await createBlockout(therapistId, newBlockDate, newBlockReason.trim() || undefined);
      setBlockouts(prev => [...prev, entry].sort((a, b) => a.blockDate.localeCompare(b.blockDate)));
      setNewBlockDate("");
      setNewBlockReason("");
    } catch {
      setBlockError("Failed to add block-out date.");
    } finally {
      setAddingBlock(false);
    }
  }

  async function handleDeleteBlockout() {
    if (deleteBlockId === null) return;
    try {
      await deleteBlockout(deleteBlockId);
      setBlockouts(prev => prev.filter(b => b.id !== deleteBlockId));
    } catch {
      setBlockError("Failed to remove block-out.");
    } finally {
      setDeleteBlockId(null);
    }
  }

  function updateSlot(dayOfWeek: number, field: "active" | "startTime" | "endTime", value: boolean | string) {
    setSlots(prev => prev.map(d => d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d));
  }

  function formatDate(iso: string) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  if (loading) {
    return <div style={{ color: "#94a3b8", fontSize: 12, padding: "16px 0" }}>Loading availability…</div>;
  }

  return (
    <div>
      {/* ── Weekly Schedule ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Weekly Schedule
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {slots.map(day => (
            <div key={day.dayOfWeek} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 12px", borderRadius: 8,
              background: day.active ? "#f0faf8" : "#f9f9f9",
              border: `1px solid ${day.active ? "#c5e8e2" : "#e8e3dd"}`,
              transition: "all 0.15s ease",
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minWidth: 110 }}>
                <input
                  type="checkbox"
                  checked={day.active}
                  onChange={e => updateSlot(day.dayOfWeek, "active", e.target.checked)}
                  style={{ accentColor: "#2d6b5f", width: 14, height: 14 }}
                />
                <span style={{ fontSize: 12, fontWeight: day.active ? 600 : 400, color: day.active ? "#1a2535" : "#94a3b8" }}>
                  {DAY_NAMES[day.dayOfWeek]}
                </span>
              </label>
              {day.active && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#64748b" }}>From</label>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={e => updateSlot(day.dayOfWeek, "startTime", e.target.value)}
                      style={{ padding: "4px 8px", border: "1px solid #ddd5cb", borderRadius: 5, fontSize: 12, color: "#1a2535", background: "#fff" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <label style={{ fontSize: 11, color: "#64748b" }}>To</label>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={e => updateSlot(day.dayOfWeek, "endTime", e.target.value)}
                      style={{ padding: "4px 8px", border: "1px solid #ddd5cb", borderRadius: 5, fontSize: 12, color: "#1a2535", background: "#fff" }}
                    />
                  </div>
                </>
              )}
              {!day.active && (
                <span style={{ fontSize: 11, color: "#c0c8d0" }}>Not available</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <button
            onClick={handleSaveSlots}
            disabled={saving}
            style={{ padding: "7px 18px", background: "#2d6b5f", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {saving ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Saving…
              </span>
            ) : "Save Schedule"}
          </button>
          {saveMsg && <span style={{ fontSize: 11, color: "#2d6b5f", fontWeight: 500 }}>{saveMsg}</span>}
          {saveError && <span style={{ fontSize: 11, color: "#dc2626" }}>{saveError}</span>}
        </div>
      </div>

      {/* ── Block-out Dates ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Block-out Dates
        </div>

        {/* Add form */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Date *</label>
            <input
              type="date"
              value={newBlockDate}
              onChange={e => setNewBlockDate(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fff" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Reason (optional)</label>
            <input
              type="text"
              value={newBlockReason}
              onChange={e => setNewBlockReason(e.target.value)}
              placeholder="e.g. Annual leave, Holiday"
              style={{ padding: "6px 10px", border: "1px solid #ddd5cb", borderRadius: 6, fontSize: 12, color: "#1a2535", background: "#fff", width: 200 }}
            />
          </div>
          <button
            onClick={handleAddBlockout}
            disabled={addingBlock}
            style={{ padding: "7px 14px", background: "#1a4a41", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            + Add
          </button>
        </div>
        {blockError && <p style={{ fontSize: 11, color: "#dc2626", marginBottom: 8 }}>{blockError}</p>}

        {/* Blockout list */}
        {blockouts.length === 0 ? (
          <div style={{ fontSize: 12, color: "#94a3b8", padding: "12px 0" }}>No block-out dates set.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {blockouts.map(b => (
              <div key={b.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px", background: "#fff8f5", border: "1px solid #fde8d8",
                borderRadius: 7,
              }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1a2535" }}>{formatDate(b.blockDate)}</span>
                  {b.reason && <span style={{ fontSize: 11, color: "#64748b", marginLeft: 10 }}>{b.reason}</span>}
                </div>
                <button
                  onClick={() => setDeleteBlockId(b.id)}
                  style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12, padding: "2px 6px" }}
                  title="Remove block-out"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deleteBlockId !== null}
        title="Remove Block-out Date"
        message="Remove this block-out date? The therapist will be available for scheduling on this date again."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDeleteBlockout}
        onCancel={() => setDeleteBlockId(null)}
      />
    </div>
  );
}
