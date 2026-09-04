import { CopyButton, PlaneIcon, PlayIcon } from "../lib/motion";

export default function Footer() {
  return (
    <footer className="relative border-t border-[var(--line-soft)] mt-8 overflow-hidden">
      {/* гигантский водяной знак */}
      <div className="pointer-events-none select-none absolute -bottom-8 left-1/2 -translate-x-1/2 font-disp font-black text-[19vw] leading-none whitespace-nowrap opacity-[0.035]" aria-hidden>
        SHORTSFLOW
      </div>

      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-16 pb-10">
        <div className="grid md:grid-cols-[1.2fr_1fr_1fr] gap-10">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-[10px] grid place-items-center" style={{ background: "linear-gradient(135deg, #2aabee, #1a7fc4)" }}>
                <PlaneIcon size={18} className="text-white" />
              </span>
              <span className="font-disp font-bold text-[16px]">
                Shorts<span className="text-[var(--tg-soft)]">Flow</span>
              </span>
            </div>
            <p className="text-[14px] text-[var(--muted)] leading-relaxed mt-4 max-w-[340px]">
              Приватный конвейер «личка Telegram → YouTube Shorts». Сделан для тех,
              кто снимает быстрее, чем загружает.
            </p>
            <div className="mt-5 inline-flex items-center gap-3 card !rounded-xl px-4 py-3">
              <code className="font-mono text-[13px] text-[var(--tg-soft)]">python main.py</code>
              <CopyButton text="python main.py" label="пуск" />
            </div>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--faint)]">Документация</p>
            <ul className="mt-4 space-y-2.5">
              {[
                ["Telegram Bot API", "https://core.telegram.org/bots/api"],
                ["python-telegram-bot", "https://docs.python-telegram-bot.org/"],
                ["YouTube Data API v3", "https://developers.google.com/youtube/v3"],
                ["OAuth 2.0 для Desktop", "https://developers.google.com/identity/protocols/oauth2/native-app"],
                ["ffmpeg filters: crop", "https://ffmpeg.org/ffmpeg-filters.html#crop"],
              ].map(([t, u]) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 text-[14px] text-[var(--muted)] hover:text-[var(--tg-soft)] transition-colors duration-200">
                    {t}
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                      <path d="M2 12 12 2M5 2h7v7" />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--faint)]">Памятка</p>
            <ul className="mt-4 space-y-2.5 text-[14px] text-[var(--muted)]">
              <li className="flex gap-2.5"><PlayIcon size={15} className="mt-0.5 shrink-0 text-[#ff8a80]" /> ≤ 60 c и 9:16 — всегда Shorts</li>
              <li className="flex gap-2.5"><PlayIcon size={15} className="mt-0.5 shrink-0 text-[#ff8a80]" /> 1 600 единиц квоты за загрузку</li>
              <li className="flex gap-2.5"><PlayIcon size={15} className="mt-0.5 shrink-0 text-[#ff8a80]" /> .env и token.json — в .gitignore</li>
              <li className="flex gap-2.5"><PlayIcon size={15} className="mt-0.5 shrink-0 text-[#ff8a80]" /> ALLOWED_IDS — только свои</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-14 pt-6 border-t border-[var(--line-soft)]">
          <p className="font-mono text-[11.5px] text-[var(--faint)]">
            © {new Date().getFullYear()} ShortsFlow · независимый проект, не связан с Telegram и YouTube
          </p>
          <a href="#top" className="group inline-flex items-center gap-2 font-mono text-[11.5px] text-[var(--muted)] hover:text-[var(--tg-soft)] transition-colors duration-200">
            наверх
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-y-0.5 transition-transform duration-200">
              <path d="M7 12V2m0 0L2.5 6.5M7 2l4.5 4.5" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
