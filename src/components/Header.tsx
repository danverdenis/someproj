import { useEffect, useState } from "react";

const NAV = [
  { href: "#pipeline", label: "Конвейер" },
  { href: "#ai", label: "AI-режим" },
  { href: "#steps", label: "Установка" },
  { href: "#code", label: "Код" },
  { href: "#config", label: "Конфиг" },
  { href: "#faq", label: "FAQ" },
];

export default function Header() {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);
      setScrolled(h.scrollTop > 10);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-[var(--line-soft)]" : "border-b border-transparent"
      }`}
      style={{
        background: scrolled ? "rgba(10,15,29,0.82)" : "transparent",
        backdropFilter: scrolled ? "blur(14px)" : "none",
        WebkitBackdropFilter: scrolled ? "blur(14px)" : "none",
      }}
    >
      {/* прогресс чтения */}
      <div
        className="absolute top-0 left-0 h-[2.5px] transition-[width] duration-150"
        style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--tg), var(--yt))" }}
      />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[68px] flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3 group" aria-label="ShortsFlow — на главную">
          <span className="relative w-9 h-9 rounded-[10px] grid place-items-center transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105"
            style={{ background: "linear-gradient(135deg, #2aabee 0%, #1a7fc4 100%)", boxShadow: "0 6px 18px -6px rgba(42,171,238,0.6)" }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path d="M3 11.5 21 4l-4.2 16.2c-.2.7-1 .9-1.5.4l-4.1-3.5-2.6 2.5c-.5.5-1.3.2-1.4-.5l-.7-4.4L3 11.5Z" fill="#fff" />
            </svg>
            <svg className="absolute -right-1.5 -bottom-1.5" width="14" height="14" viewBox="0 0 16 16">
              <rect width="16" height="16" rx="5" fill="#0d1424" />
              <path d="M6 4.5v7l6-3.5-6-3.5Z" fill="#ff4438" />
            </svg>
          </span>
          <span className="font-disp font-bold text-[15px] tracking-tight leading-none">
            Shorts<span className="text-[var(--tg-soft)]">Flow</span>
            <span className="block font-mono font-normal text-[9.5px] text-[var(--faint)] tracking-[0.18em] mt-1">TG → YOUTUBE SHORTS</span>
          </span>
        </a>

        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}
              className="px-3.5 py-2 rounded-lg text-[14px] font-medium text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[rgba(42,171,238,0.08)] transition-colors duration-200">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="chip !text-[10px]" style={{ borderColor: "rgba(69,212,131,0.4)", color: "var(--ok)" }}>
            <span className="w-[7px] h-[7px] rounded-full bg-[var(--ok)] pulse-dot inline-block" />
            демо · онлайн
          </span>
          <a href="#code" className="btn btn-tg !py-2 !px-4 !text-[13.5px] hidden sm:inline-flex">
            Скачать код
          </a>
        </div>
      </div>
    </header>
  );
}
