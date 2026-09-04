import ChatDemo from "./ChatDemo";
import { ScrambleText } from "../lib/motion";
import { LOG_LINES } from "../lib/content";
import { PlaneIcon, PlayIcon } from "../lib/motion";

const META = [
  "python-telegram-bot",
  "ffmpeg · 9:16",
  "AI-режим: Groq + Pollinations + edge-tts",
  "whitelist по chat_id",
];

function LogTicker() {
  const row = (key: string) => (
    <div key={key} className="flex items-center shrink-0" aria-hidden={key === "b"}>
      {LOG_LINES.map((l, i) => (
        <span key={i} className="flex items-center font-mono text-[12px] text-[var(--muted)] whitespace-nowrap">
          <svg width="11" height="11" viewBox="0 0 12 12" className="mx-4 shrink-0" fill="none">
            <path d="M2 2.5 8.5 6 2 9.5v-7Z" fill={i % 3 === 0 ? "var(--tg)" : i % 3 === 1 ? "var(--amber)" : "var(--yt)"} />
          </svg>
          {l}
        </span>
      ))}
    </div>
  );
  return (
    <div className="marquee relative overflow-hidden border-y border-[var(--line-soft)] py-3" style={{ background: "rgba(11,17,32,0.7)" }}>
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: "linear-gradient(90deg, var(--bg), transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: "linear-gradient(270deg, var(--bg), transparent)" }} />
      <div className="marquee-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="relative pt-[120px] pb-0">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-14 lg:gap-10 items-center pb-20">
          {/* левая колонка */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5" data-reveal>
              <span className="chip !text-[var(--tg-soft)] !border-[rgba(42,171,238,0.4)]">
                <PlaneIcon size={13} /> приватный телеграм-бот
              </span>
              <span className="chip !text-[#ff9d95] !border-[rgba(255,68,56,0.4)]">
                <PlayIcon size={13} /> автопубликация
              </span>
              <span className="chip !text-[var(--ok)] !border-[rgba(69,212,131,0.4)]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2.5 14.2 8.8l6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3-6.3-2.2 6.3-2.2L12 2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
                AI-режим · идея → ролик
              </span>
            </div>

            <h1 className="font-disp font-black leading-[1.02] mt-7 text-[38px] sm:text-[54px] xl:text-[62px]" data-reveal style={{ "--rd": "80ms" } as React.CSSProperties}>
              <span className="text-[var(--muted)] font-bold text-[0.52em] block tracking-wide mb-2">видео приходит в</span>
              <span className="text-[var(--tg-soft)]">
                <ScrambleText text="TELEGRAM," />
              </span>
              <br />
              <span className="text-[var(--muted)] font-bold text-[0.52em] tracking-wide">уходит в </span>
              <span className="text-[#ff6b60]">
                <ScrambleText text="SHORTS" delay={350} />
              </span>
              <span className="text-[#ff6b60] inline-block align-top text-[0.4em] mt-2">▶</span>
            </h1>

            <p className="mt-7 max-w-[540px] text-[17px] leading-relaxed text-[var(--muted)]" data-reveal style={{ "--rd": "160ms" } as React.CSSProperties}>
              <b className="text-[var(--ink)]">ShortsFlow</b> — бот-конвейер для своих: кидаете ему ролик в личку,
              а он режет его до 60 секунд, кадрирует в вертикаль 9:16 и сам публикует на ваш
              YouTube-канал. А в AI-режиме — собирает ролик из идеи в пару строк:
              сценарий, кадры, озвучка и превью с кнопкой «Опубликовать».
              Без браузера, без лишних глаз — отвечает только вашему chat_id.
            </p>

            <div className="flex flex-wrap gap-2 mt-6" data-reveal style={{ "--rd": "220ms" } as React.CSSProperties}>
              {META.map((m) => (
                <span key={m} className="chip">{m}</span>
              ))}
            </div>

            <div className="flex flex-wrap gap-3.5 mt-9" data-reveal style={{ "--rd": "280ms" } as React.CSSProperties}>
              <a href="#code" className="btn btn-tg">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0 4.5-4.5M12 15 7.5 10.5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                </svg>
                Код бота · 2 модуля
              </a>
              <a href="#steps" className="btn btn-ghost">
                Установить за 10 минут
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </a>
            </div>

            {/* мини-статистика */}
            <div className="grid grid-cols-3 max-w-[440px] gap-px mt-12 rounded-xl overflow-hidden border border-[var(--line-soft)]" data-reveal style={{ "--rd": "340ms" } as React.CSSProperties}>
              {[
                ["~40 c", "от «отправил» до ссылки"],
                ["2 режима", "видео + идея → AI-ролик"],
                ["0 ₽", "AI-стек · бесплатные tier'ы"],
              ].map(([v, l]) => (
                <div key={v} className="px-4 py-4" style={{ background: "rgba(18,27,48,0.72)" }}>
                  <p className="font-disp font-bold text-[19px] text-[var(--tg-soft)]">{v}</p>
                  <p className="text-[11.5px] text-[var(--faint)] leading-snug mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* правая колонка — живой чат */}
          <ChatDemo />
        </div>
      </div>

      <LogTicker />
    </section>
  );
}
