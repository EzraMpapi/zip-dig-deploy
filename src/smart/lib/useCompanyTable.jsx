import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SortAsc, SortDesc
} from "lucide-react";

// ── useSortableTable — adds sort + filter to any table ───────────────────────
// Usage: const { sorted, sortCol, sortDir, doSort } = useSortableTable(rows)
// ── useDebounce — debounce any fast-changing value ───────────────────────────
// ── useLocalPersist — persist state to localStorage ──────────────────────────
export function useLocalPersist(key, defaultVal) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem("bs_" + key);
      return stored !== null ? JSON.parse(stored) : defaultVal;
    } catch (_e) { return defaultVal; }
  });
  const setPersist = useCallback((v) => {
    setVal(v);
    try { localStorage.setItem("bs_" + key, JSON.stringify(v)); } catch (_e) {}
  }, [key]);
  return [val, setPersist];
}

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function useSortableTable(rows = []) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [filterQ,  setFilterQ]  = useState("");

  const doSort = useCallback((col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }, [sortCol]);

  const sorted = useMemo(() => {
    let rows2 = [...rows];
    if (filterQ) {
      const q = filterQ.toLowerCase();
      rows2 = rows2.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (sortCol) {
      rows2.sort((a, b) => {
        const va = a[sortCol] ?? "", vb = b[sortCol] ?? "";
        const n = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortDir === "asc" ? n : -n;
      });
    }
    return rows2;
  }, [rows, sortCol, sortDir, filterQ]);

  const SortHeader = ({ col, label, className="" }) => (
    <th className={"cursor-pointer select-none hover:bg-slate-100 transition-colors " + className}
        onClick={() => doSort(col)}>
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {sortCol === col
          ? sortDir === "asc"
            ? <SortAsc size={11} className="text-[#16A34A] shrink-0"/>
            : <SortDesc size={11} className="text-[#16A34A] shrink-0"/>
          : <span className="w-[11px]"/>}
      </div>
    </th>
  );

  return { sorted, sortCol, sortDir, doSort, filterQ, setFilterQ, SortHeader };
}
