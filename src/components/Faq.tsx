import { useState } from "react";
import { FAQ } from "../lib/content";
import { SectionHead } from "../lib/motion";

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
          <div className="lg:sticky lg:top-28">
            <SectionHead
              index="06"
              kicker="вопросы"
              title={<>Спрашивают <span className="text-[var(--tg-soft)]">перед запуском</span></>}
              lead="Собрано из реальных граблей: Shorts, которые не стали Shorts, квоты, лимиты Bot API и смена аккаунта."
            />
            <div className="card p-5 mt-8 hidden lg:block" data-reveal>
              <p className="font-mono text-[12px] text-[var(--faint)] leading-relaxed">
                <span className="text-[var(--ok)]">$</span> не нашли ответ?<br />
                Откройте <span className="text-[var(--tg-soft)]">main.py</span> — он читается сверху вниз
                как инструкция: приём → обработка → публикация.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {FAQ.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className={`card overflow-hidden transition-all duration-300 ${isOpen ? "border-[rgba(42,171,238,0.5)]" : ""}`} data-reveal style={{ "--rd": `${i * 60}ms` } as React.CSSProperties}>
                  <button
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="w-full flex items-center gap-4 px-5 sm:px-6 py-4.5 text-left cursor-pointer group"
                    style={{ padding: "18px 22px" }}
                    aria-expanded={isOpen}
                  >
                    <span className={`font-mono text-[12px] shrink-0 transition-colors duration-300 ${isOpen ? "text-[var(--tg-soft)]" : "text-[var(--faint)]"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={`flex-1 font-semibold text-[15.5px] leading-snug transition-colors duration-200 ${isOpen ? "text-[var(--ink)]" : "text-[var(--muted)] group-hover:text-[var(--ink)]"}`}>
                      {f.q}
                    </span>
                    <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 border transition-all duration-300 ${isOpen ? "border-[var(--tg)] bg-[rgba(42,171,238,0.12)] rotate-45" : "border-[var(--line)]"}`}>
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke={isOpen ? "var(--tg-soft)" : "var(--muted)"} strokeWidth="2" strokeLinecap="round">
                        <path d="M7 1.5v11M1.5 7h11" />
                      </svg>
                    </span>
                  </button>
                  <div className={`faq-body ${isOpen ? "open" : ""}`}>
                    <div>
                      <p className="px-5 sm:px-6 pb-5 pl-[52px] text-[14.5px] text-[var(--muted)] leading-relaxed">
                        {f.a}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
