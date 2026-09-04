import { STAGES, Stage } from "../lib/content";
import { SectionHead } from "../lib/motion";

function StageIcon({ tone }: { tone: Stage["tone"] }) {
  const c = tone === "tg" ? "var(--tg-soft)" : tone === "amber" ? "var(--amber)" : "#ff6b60";
  if (tone === "tg") {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <path d="M4 15.5 28 5.5l-5.6 21.4c-.25.95-1.35 1.2-2 .5l-5.4-4.7-3.5 3.3c-.65.62-1.75.25-1.85-.65L8.7 19 4 15.5Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        <path d="m13 17.2 8.6-7.8" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (tone === "amber") {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <rect x="10.5" y="4.5" width="11" height="23" rx="2.5" stroke={c} strokeWidth="2" />
        <path d="M4.5 9 10 13M4.5 23 10 19m17.5-10L22 13m5.5 10L22 19" stroke={c} strokeWidth="2" strokeLinecap="round" />
        <path d="m14 13.5 4.5 2.5-4.5 2.5v-5Z" fill={c} />
      </svg>
    );
  }
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
      <rect x="4.5" y="8" width="23" height="17" rx="4" stroke={c} strokeWidth="2" />
      <path d="M13.5 13v7l6.5-3.5-6.5-3.5Z" fill={c} />
      <path d="m11 4 5 4 5-4" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Connector() {
  return (
    <div className="hidden md:block flex-1 self-center px-1" aria-hidden>
      <svg width="100%" height="26" viewBox="0 0 120 26" preserveAspectRatio="none">
        <line x1="0" y1="13" x2="98" y2="13" stroke="var(--line)" strokeWidth="2" />
        <line x1="0" y1="13" x2="98" y2="13" stroke="var(--tg-soft)" strokeWidth="2" className="flow-dash" opacity="0.85" />
        <path d="m98 6 12 7-12 7V6Z" fill="var(--tg-soft)" />
      </svg>
    </div>
  );
}

export default function Pipeline() {
  return (
    <section id="pipeline" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <SectionHead
          index="01"
          kicker="конвейер"
          title={<>Три стадии — и ролик <span className="text-[#ff6b60]">в эфире</span></>}
          lead="Никакой магии: бот повторяет то, что вы делали бы руками, только за сорок секунд и без единого лишнего клика."
        />

        <div className="mt-14 flex flex-col md:flex-row items-stretch gap-4 md:gap-0">
          {STAGES.map((s, i) => (
            <div key={s.num} className="contents">
              <div className="flex-1" data-reveal style={{ "--rd": `${i * 120}ms` } as React.CSSProperties}>
                <div className={`card lift ${s.tone === "yt" ? "lift-yt" : ""} h-full p-6 relative overflow-hidden`}>
                  <div className="absolute -top-7 -right-3 font-disp font-black text-[86px] leading-none opacity-[0.055] select-none" aria-hidden>
                    {s.num}
                  </div>
                  <div className="flex items-center gap-3.5">
                    <span className="w-14 h-14 rounded-xl grid place-items-center border border-[var(--line-soft)] shrink-0"
                      style={{ background: "rgba(11,17,32,0.8)" }}>
                      <StageIcon tone={s.tone} />
                    </span>
                    <div>
                      <p className="font-mono text-[11px] tracking-[0.18em] text-[var(--faint)]">СТАДИЯ {s.num}</p>
                      <h3 className="font-disp font-bold text-[17px] mt-0.5">{s.title}</h3>
                    </div>
                  </div>
                  <p className="text-[14.5px] text-[var(--muted)] leading-relaxed mt-4">{s.desc}</p>
                  <div className="flex flex-wrap gap-1.5 mt-5">
                    {s.tags.map((t) => (
                      <span key={t} className="chip !text-[10px] !py-[3px]">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              {i < STAGES.length - 1 && <Connector />}
            </div>
          ))}
        </div>

        {/* «под капотом» */}
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-[var(--line-soft)]" data-reveal>
          {[
            ["long-polling", "бот висит на getUpdates — вебхуки и белый IP не нужны"],
            ["resumable upload", "загрузка чанками: обрыв сети не убивает публикацию"],
            ["подпись → заголовок", "текст под видео в Telegram становится title ролика"],
            ["tmp чистится сама", "файлы живут только на время обработки и удаляются в finally"],
          ].map(([t, d]) => (
            <div key={t} className="p-5 transition-colors duration-300 hover:bg-[rgba(42,171,238,0.05)]" style={{ background: "rgba(15,22,40,0.72)" }}>
              <p className="font-mono text-[12px] text-[var(--tg-soft)]">{t}</p>
              <p className="text-[13px] text-[var(--muted)] mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
