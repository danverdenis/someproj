import { useEffect, useRef, useState } from "react";
import { STEPS } from "../lib/content";
import { CopyButton, SectionHead, prefersReduced } from "../lib/motion";

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between px-3.5 py-2 rounded-t-[11px] border border-b-0 border-[var(--line-soft)]" style={{ background: "#0e1730" }}>
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--faint)]">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="codebox !rounded-t-none p-4 m-0 whitespace-pre-wrap break-words">{code}</pre>
    </div>
  );
}

export default function Steps() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  /* scroll-spy: подсвечиваем текущий шаг */
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            setActive(idx);
          }
        });
      },
      { rootMargin: "-38% 0px -52% 0px", threshold: 0 }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (i: number) => {
    refs.current[i]?.scrollIntoView({
      behavior: prefersReduced() ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <section id="steps" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12">
          {/* левая колонка — липкая навигация по шагам */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHead
              index="02"
              kicker="установка"
              title={<>Десять минут —<br />и бот <span className="text-[var(--tg-soft)]">в строю</span></>}
              lead="Понадобятся: аккаунт Telegram, аккаунт Google и любая машина с Python 3.10+ — от Raspberry Pi до VPS за двести рублей."
            />
            <div className="mt-9 space-y-1.5" data-reveal>
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => jump(i)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                    active === i
                      ? "border-[rgba(42,171,238,0.55)] bg-[rgba(42,171,238,0.09)] translate-x-1"
                      : "border-transparent hover:border-[var(--line)] hover:bg-[rgba(18,27,48,0.6)]"
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg grid place-items-center font-mono text-[12px] font-bold shrink-0 transition-colors duration-300 ${
                    active === i ? "bg-[var(--tg)] text-[#06131f]" : "" }`}
                    style={active !== i ? { background: "#18233f", color: "var(--muted)" } : undefined}
                  >
                    {s.num}
                  </span>
                  <span className={`text-[14.5px] font-semibold transition-colors duration-300 ${active === i ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
                    {s.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* правая колонка — карточки шагов */}
          <div className="space-y-6">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                data-idx={i}
                ref={(el) => { refs.current[i] = el; }}
                className={`card p-6 sm:p-7 transition-all duration-500 ${active === i ? "border-[rgba(42,171,238,0.45)]" : ""}`}
                data-reveal
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-disp font-black text-[26px] text-[rgba(42,171,238,0.35)] leading-none">{s.num}</span>
                  <h3 className="font-disp font-bold text-[19px]">{s.title}</h3>
                </div>
                <p className="text-[15px] text-[var(--muted)] leading-relaxed mt-3.5">{s.text}</p>
                {s.points && (
                  <ul className="mt-4 space-y-2">
                    {s.points.map((p) => (
                      <li key={p} className="flex gap-2.5 text-[14px] text-[var(--muted)]">
                        <svg width="15" height="15" viewBox="0 0 16 16" className="mt-1 shrink-0" fill="none">
                          <path d="M2.5 8.5 6 12l7.5-8" stroke="var(--tg-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                {s.code && <CodeBlock code={s.code} label={s.codeLang || "команда"} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
