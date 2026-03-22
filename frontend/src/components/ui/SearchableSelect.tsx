// Searchable dropdown — renders a trigger button + filtered list with a search input.
// Supports full keyboard navigation: ArrowUp/Down, Enter, Escape.

import { useState, useEffect, useRef } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: React.CSSProperties;
}

export default function SearchableSelect({ options, value, onChange, placeholder, style }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  // Build full option list: placeholder option + filtered results
  const allOptions = [{ value: "", label: placeholder }, ...filtered];

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setSearch("");
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < allOptions.length - 1 ? prev + 1 : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : allOptions.length - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < allOptions.length) {
        choose(allOptions[highlightedIndex].value);
      }
    }
  }

  const activeDescendant =
    highlightedIndex >= 0 ? `searchable-select-opt-${highlightedIndex}` : undefined;

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <div style={{ ...s.trigger, ...(open ? s.triggerOpen : {}) }} onClick={() => setOpen((o) => !o)}>
        <span style={{ color: selected ? "#1a2535" : "#b8c4cc", fontSize: 12 }}>
          {selected ? selected.label : placeholder}
        </span>
        <span style={{ color: "#b8c4cc", fontSize: 10, marginLeft: "auto" }}>&#9662;</span>
      </div>
      {open && (
        <div style={s.dropdown}>
          <div style={s.searchWrap}>
            <input
              ref={inputRef}
              autoFocus
              style={s.searchInput}
              placeholder="Search\u2026"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
              aria-activedescendant={activeDescendant}
              aria-controls="searchable-select-listbox"
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
            />
          </div>
          <div style={s.list} role="listbox" id="searchable-select-listbox">
            {allOptions.map((o, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = o.value === value;
              const isPlaceholder = idx === 0;
              return (
                <div
                  key={o.value || "__placeholder__"}
                  id={`searchable-select-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  style={{
                    ...s.option,
                    ...(isSelected ? s.selectedOpt : {}),
                    ...(isHighlighted ? s.highlightedOpt : {}),
                  }}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                >
                  {isPlaceholder ? (
                    <span style={{ color: "#b8c4cc" }}>{o.label}</span>
                  ) : (
                    o.label
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", color: "#b8c4cc", fontSize: 11 }}>No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  trigger: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "8px 11px", border: "1px solid #ddd5cb", borderRadius: 6,
    background: "#fdfbf9", cursor: "pointer", minHeight: 34,
    userSelect: "none",
  },
  triggerOpen: { borderColor: "#2d6b5f", boxShadow: "0 0 0 3px rgba(45,107,95,0.12)" },
  dropdown: {
    position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
    background: "#fff", border: "1px solid #ddd5cb", borderRadius: 8,
    boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 1100,
    overflow: "hidden",
  },
  searchWrap: { padding: "8px 8px 4px" },
  searchInput: {
    width: "100%", padding: "6px 10px", border: "1px solid #ddd5cb",
    borderRadius: 5, fontSize: 12, outline: "none", background: "#f7f2ec",
    boxSizing: "border-box",
  },
  list: { maxHeight: 200, overflowY: "auto" },
  option: {
    padding: "8px 11px", fontSize: 12, color: "#1a2535", cursor: "pointer",
    transition: "background 0.1s",
  },
  selectedOpt: { background: "#e4f2ee", color: "#2d6b5f", fontWeight: 600 },
  highlightedOpt: { background: "#f0ede8" },
};
