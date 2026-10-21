import { useEffect, useState, useSyncExternalStore } from "react";

/** مؤقت الجلسة الجارية؛ يُحفظ في المتصفح حتى لا يضيع عند تحديث الصفحة */
export interface TimerState {
  startedAt: string;
  pathId: string | null;
  taskId: string | null;
  label: string | null;
}

const KEY = "masar.timer";
const listeners = new Set<() => void>();

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimerState) : null;
  } catch {
    return null; // تخزين المتصفح معطّل (نافذة خاصة مثلاً): المؤقت يعمل في الذاكرة فقط
  }
}

let current: TimerState | null = load();

function set(next: TimerState | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // نتجاهل: الحالة محفوظة في الذاكرة
  }
  listeners.forEach((listener) => listener());
}

// مزامنة بين تبويبات المتصفح المفتوحة (الشرط لأن الاختبارات تعمل بلا متصفح)
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return;
    current = load();
    listeners.forEach((listener) => listener());
  });
}

export const timerStore = {
  start: (state: Omit<TimerState, "startedAt">) => set({ ...state, startedAt: new Date().toISOString() }),
  clear: () => set(null),
  get: () => current,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useTimer(): TimerState | null {
  return useSyncExternalStore(timerStore.subscribe, timerStore.get);
}

/** الوقت الحالي، يتحدّث كل ثانية ما دام المكوّن ظاهراً */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function elapsedMinutes(startedAt: string, now = Date.now()): number {
  return Math.max(1, Math.round((now - Date.parse(startedAt)) / 60_000));
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
