import { useEffect, useRef, useState, useCallback } from "react";

/* prefers-reduced-motion */
export function prefersReduced(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ── Reveal on scroll ─────────────────────────────────────── */
export function useRevealObserver() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll("[data-reveal]"));
    if (prefersReduced()) {
      els.forEach((el) => el.classList.add("rev-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("rev-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Scramble-decode text ─────────────────────────────────── */
const GLYPHS = "▓▒░<>/\\#%&@01△▸·";

export function ScrambleText({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const [out, setOut] = useState(() => (prefersReduced() ? text : ""));
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (prefersReduced()) {
      setOut(text);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        let frame = 0;
        const total = Math.max(14, text.length * 2);
        const timer = window.setInterval(() => {
          frame++;
          const resolved = Math.floor((frame / total) * text.length);
          let s = text.slice(0, resolved);
          for (let i = resolved; i < text.length; i++) {
            s += text[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          setOut(s);
          if (resolved >= text.length) {
            setOut(text);
            window.clearInterval(timer);
          }
        }, 34);
      },
      { threshold: 0.4 }
    );
    const t = window.setTimeout(() => io.observe(el), delay);
    return () => {
      window.clearTimeout(t);
      io.disconnect();
    };
  }, [text, delay]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      {out || "\u00A0"}
    </span>
  );
}

/* ── Copy button with feedback ────────────────────────────── */
export function CopyButton({
  text,
  label = "Копировать",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, [text]);

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all duration-200 cursor-pointer ${
        copied
          ? "border-[var(--ok)] text-[var(--ok)] bg-[rgba(69,212,131,0.08)]"
          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--tg)] hover:text-[var(--tg-soft)]"
      } ${className}`}
      aria-live="polite"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {copied ? "Скопировано" : label}
    </button>
  );
}

/* ── Section heading ──────────────────────────────────────── */
export function SectionHead({
  index,
  kicker,
  tone = "tg",
  title,
  lead,
}: {
  index: string;
  kicker: string;
  tone?: "tg" | "yt" | "amber";
  title: React.ReactNode;
  lead?: string;
}) {
  return (
    <div className="max-w-3xl" data-reveal>
      <div className={`kicker ${tone === "yt" ? "yt" : tone === "amber" ? "amber" : ""}`}>
        {index} · {kicker}
      </div>
      <h2 className="font-disp text-[26px] sm:text-[34px] leading-[1.15] font-bold mt-4 text-[var(--ink)]">
        {title}
      </h2>
      {lead && <p className="mt-4 text-[17px] text-[var(--muted)] leading-relaxed">{lead}</p>}
    </div>
  );
}

/* ── Custom inline icons ──────────────────────────────────── */
export function PlaneIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
      <path d="M3 11.5 21 4l-4.2 16.2c-.2.7-1 .9-1.5.4l-4.1-3.5-2.6 2.5c-.5.5-1.3.2-1.4-.5l-.7-4.4L3 11.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m9.7 12.8 6.6-5.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PlayIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
      <rect x="2.5" y="4.5" width="19" height="15" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10.2 9.4v5.2c0 .5.55.8.97.53l4.06-2.6a.63.63 0 0 0 0-1.06l-4.06-2.6a.63.63 0 0 0-.97.53Z" fill="currentColor" />
    </svg>
  );
}

export function ShieldIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8L12 3Z" />
      <path d="m9 11.6 2.2 2.2L15.4 9" />
    </svg>
  );
}

export function KeyIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="14.5" r="4.2" />
      <path d="m11.2 11.3 7.6-7.6M16 6.5l2.6 2.6M13.4 9.1l2 2" />
    </svg>
  );
}

export function GaugeIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 17.5a8.5 8.5 0 1 1 15 0" />
      <path d="m12 13.8 3.6-4.6" />
      <circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FilmIcon({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 3.5v17M16 3.5v17M3.5 8H8m8 0h4.5M3.5 16H8m8 0h4.5" />
    </svg>
  );
}
