import { useState } from "react";
import { STAGES_DIRECT, STAGES_AI, Stage } from "../lib/content";
import { SectionHead } from "../lib/motion";

type Mode = "direct" | "ai";

const MODE_META: Record<Mode, { label: string; hint: string }> = {
  direct: { label: "Видео-режим", hint: "файл в личку → ссылка за ~40 секунд" },
  ai: { label: "AI-режим", hint: "пара строк → сценарий → ролик → ваша кнопка" },
};

const UNDERHOOD: Record<Mode, [string, string][]> = {
  direct: [
    ["long-polling", "бот висит на getUpdates — вебхуки и белый IP не нужны"],
    ["resumable upload", "загрузка чанками: обрыв сети не убивает публикацию"],
    ["подпись → заголовок", "текст под видео в Telegram становится title ролика"],
    ["tmp чистится сама", "файлы живут только на время обработки и удаляются в finally"],
  ],
  ai: [
    ["JSON schema", "LLM отдаёт сценарий строго структурой — парсить свободный текст не нужно"],
    ["параллельные задачи", "кадры и озвучка каждой сцены качаются одновременно"],
    ["seed на дубль", "«Ещё дубль» перерисовывает кадры с новым seed — вариант другой"],
    ["публикация по кнопке", "без нажатия «Опубликовать» на канал не уходит ничего"],
  ],
};

function StageIcon({ tone }: { tone: Stage["tone"] }) {
  const c =
    tone === "tg" ? "var(--tg-soft)"
    : tone === "amber" ? "var(--amber)"
    : tone === "ok" ? "var(--ok)"
    : "#ff6b60";
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
  if (tone === "ok") {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
        <path d="M16 4.5 18.6 12l7.9 2.6-7.9 2.6L16 25l-2.6-7.8-7.9-2.6L13.4 12 16 4.5Z" stroke={c} strokeWidth="2" strokeLinejoin="round" />
        <path d="M25.5 22.5 26.6 25l2.4 1-2.4 1-1.1 2.5L24.4 27 22 26l2.4-1 1.1-2.5Z" fill={c} />
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
    <div className="hidden lg:block flex-1 self-center px-1 min-w-[36px]" aria-hidden>
      <svg width="100%" height="26" viewBox="0 0 120 26" preserveAspectRatio="none">
        <line x1="0" y1="13" x2="98" y2="13" stroke="var(--line)" strokeWidth="2" />
        <line x1="0" y1="13" x2="98" y2="13" stroke="var(--tg-soft)" strokeWidth="2" className="flow-dash" opacity="0.85" />
        <path d="m98 6 12 7-12 7V6Z" fill="var(--tg-soft)" />
      </svg>
    </div>
  );
}

export default function Pipeline() {
  const [mode, setMode] = useState<Mode>("direct");
  const stages = mode === "direct" ? STAGES_DIRECT : STAGES_AI;
  const meta = MODE_META[mode];

  return (
    <section id="pipeline" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <SectionHead
            index="01"
            kicker="конвейер"
            title={<>От файла или от идеи — <span className="text-[#ff6b60]">всегда в Shorts</span></>}
            lead="Классика: кинули ролик — получили ссылку. AI-режим: описали идею парой строк — бот написал сценарий, собрал видео и ждёт вашу кнопку."
          />

          {/* переключатель режимов */}
          <div className="shrink-0" data-reveal>
            <div className="relative inline-flex p-1 rounded-xl border border-[var(--line)]" style={{ background: "rgba(11,17,32,0.85)" }}>
              <span
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg transition-transform duration-300 ease-out"
                style={{
                  transform: mode === "ai" ? "translateX(100%)" : "translateX(0)",
                  background: mode === "ai"
                    ? "linear-gradient(135deg, rgba(69,212,131,0.22), rgba(69,212,131,0.08))"
                    : "linear-gradient(135deg, rgba(42,171,238,0.22), rgba(42,171,238,0.08))",
                  boxShadow: `inset 0 0 0 1px ${mode === "ai" ? "rgba(69,212,131,0.5)" : "rgba(42,171,238,0.5)"}`,
                }}
                aria-hidden
              />
              {(["direct", "ai"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`relative z-10 px-5 py-2.5 rounded-lg font-semibold text-[14px] transition-colors duration-300 cursor-pointer ${
                    mode === m ? "text-[var(--ink)]" : "text-[var(--faint)] hover:text-[var(--muted)]"
                  }`}
                >
                  {MODE_META[m].label}
                </button>
              ))}
            </div>
            <p className="font-mono text-[11.5px] text-[var(--faint)] mt-2.5 text-right transition-opacity duration-300" key={mode}>
              <span className="swap-in inline-block">{meta.hint}</span>
            </p>
          </div>
        </div>

        {/* стадии */}
        <div key={mode} className="mt-12">
          {mode === "direct" ? (
            <div className="flex flex-col lg:flex-row items-stretch gap-4 lg:gap-0 swap-in">
              {stages.map((s, i) => (
                <div key={s.num} className="contents">
                  <div className="flex-1">
                    <div className={`card lift ${s.tone === "yt" ? "lift-yt" : ""} h-full p-6 relative overflow-hidden`}>
                      <div className="absolute -top-7 -right-3 font-disp font-black text-[86px] leading-none opacity-[0.055] select-none" aria-hidden>{s.num}</div>
                      <div className="flex items-center gap-3.5">
                        <span className="w-14 h-14 rounded-xl grid place-items-center border border-[var(--line-soft)] shrink-0" style={{ background: "rgba(11,17,32,0.8)" }}>
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
                  {i < stages.length - 1 && <Connector />}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 swap-in">
              {stages.map((s, i) => (
                <div key={s.num} className={`card lift ${s.tone === "yt" ? "lift-yt" : ""} p-5 relative overflow-hidden flex flex-col`}>
                  <div className="absolute -top-6 -right-2 font-disp font-black text-[72px] leading-none opacity-[0.05] select-none" aria-hidden>{s.num}</div>
                  <div className="flex items-center justify-between">
                    <span className="w-12 h-12 rounded-xl grid place-items-center border border-[var(--line-soft)]" style={{ background: "rgba(11,17,32,0.8)" }}>
                      <StageIcon tone={s.tone} />
                    </span>
                    {i < stages.length - 1 && (
                      <svg width="22" height="12" viewBox="0 0 22 12" fill="none" aria-hidden className="text-[var(--faint)]">
                        <path d="M1 6h17m0 0-4.5-4.5M18 6l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <p className="font-mono text-[10.5px] tracking-[0.18em] text-[var(--faint)] mt-4">ШАГ {s.num}</p>
                  <h3 className="font-disp font-bold text-[15.5px] mt-0.5 leading-snug">{s.title}</h3>
                  <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-2.5 flex-1">{s.desc}</p>
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {s.tags.map((t) => (
                      <span key={t} className="chip !text-[9.5px] !py-[2px] !px-2">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* «под капотом» */}
        <div key={`uh-${mode}`} className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-xl overflow-hidden border border-[var(--line-soft)] swap-in">
          {UNDERHOOD[mode].map(([t, d]) => (
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
