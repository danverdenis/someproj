import { useEffect, useRef, useState } from "react";
import { LIMITS } from "../lib/content";
import { SectionHead, GaugeIcon, ShieldIcon, KeyIcon, FilmIcon, prefersReduced } from "../lib/motion";

export default function Safety() {
  const [fill, setFill] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  /* квота «доезжает» до 16% при появлении */
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setFill(prefersReduced() ? 16 : 16);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="safety" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <SectionHead
          index="06"
          kicker="приватность и лимиты"
          tone="yt"
          title={<>Свои — проходят, <span className="text-[#ff6b60]">чужие — в лог</span></>}
          lead="Бот задуман как личный инструмент, поэтому безопасность вшита в архитектуру, а не прикручена сверху."
        />

        <div className="mt-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-start">
          {/* левая колонка */}
          <div className="space-y-6">
            {/* whitelist */}
            <div className="card lift p-6 sm:p-7" data-reveal>
              <div className="flex items-center gap-3.5">
                <span className="w-12 h-12 rounded-xl grid place-items-center border border-[var(--line-soft)] text-[var(--ok)]" style={{ background: "rgba(11,17,32,0.8)" }}>
                  <ShieldIcon size={24} />
                </span>
                <div>
                  <h3 className="font-disp font-bold text-[17px]">Whitelist по chat_id</h3>
                  <p className="text-[13px] text-[var(--faint)]">первая проверка в обработчике — до скачивания файла</p>
                </div>
              </div>
              <p className="text-[14.5px] text-[var(--muted)] leading-relaxed mt-4">
                Каждый входящий апдейт сверяется с ALLOWED_IDS. Чужак получает сухое
                «Доступ запрещён» и свой id — а вы видите в журнале, кто стучался:
              </p>
              <div className="mt-4">
                <div className="flex items-center justify-between px-3.5 py-2 rounded-t-[11px] border border-b-0 border-[var(--line-soft)]" style={{ background: "#0e1730" }}>
                  <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--faint)]">journalctl -u shortsflow</span>
                </div>
                <pre className="codebox !rounded-t-none p-4 m-0 text-[12.5px]">
<span className="text-[#54688f]">14:05:11</span> <span className="text-[var(--amber)]">WARNING</span> Отклонён чужой запрос:
           spam_bot_3000 (id=<span className="text-[#ff8a80]">555012345</span>)
<span className="text-[#54688f]">14:05:12</span> <span className="text-[var(--ok)]">INFO</span>    video_043.mp4 · от id <span className="text-[var(--tg-soft)]">123456789</span> · ok</pre>
              </div>
            </div>

            {/* токены */}
            <div className="card lift p-6 sm:p-7" data-reveal style={{ "--rd": "100ms" } as React.CSSProperties}>
              <div className="flex items-center gap-3.5">
                <span className="w-12 h-12 rounded-xl grid place-items-center border border-[var(--line-soft)] text-[var(--amber)]" style={{ background: "rgba(11,17,32,0.8)" }}>
                  <KeyIcon size={24} />
                </span>
                <div>
                  <h3 className="font-disp font-bold text-[17px]">Секреты живут на вашей машине</h3>
                  <p className="text-[13px] text-[var(--faint)]">BOT_TOKEN, credentials.json, token.json</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {[
                  "OAuth-scope минимальный: youtube.upload — бот не читает почту, диск и аналитику",
                  "refresh-токен обновляет доступ сам — логиниться повторно не придётся",
                  "передача — только HTTPS: Telegram Bot API и Google API по-другому не умеют",
                  "никаких сторонних сервисов между вами и YouTube: цепочка из двух звеньев",
                ].map((t) => (
                  <li key={t} className="flex gap-2.5 text-[14px] text-[var(--muted)]">
                    <svg width="14" height="14" viewBox="0 0 16 16" className="mt-1 shrink-0" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="var(--amber)" strokeWidth="1.6" />
                      <circle cx="8" cy="8" r="2" fill="var(--amber)" />
                    </svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* правая колонка */}
          <div className="space-y-6">
            {/* квота */}
            <div className="card lift lift-yt p-6 sm:p-7" data-reveal style={{ "--rd": "60ms" } as React.CSSProperties}>
              <div className="flex items-center gap-3.5">
                <span className="w-12 h-12 rounded-xl grid place-items-center border border-[var(--line-soft)] text-[#ff8a80]" style={{ background: "rgba(11,17,32,0.8)" }}>
                  <GaugeIcon size={24} />
                </span>
                <div>
                  <h3 className="font-disp font-bold text-[17px]">Квота YouTube Data API</h3>
                  <p className="text-[13px] text-[var(--faint)]">восстанавливается каждые сутки в 00:00 PST</p>
                </div>
              </div>

              <div ref={barRef} className="mt-6">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="font-mono text-[12px] text-[var(--muted)]">одна загрузка = 1 600 единиц</span>
                  <span className="font-disp font-bold text-[15px] text-[#ff8a80]">16%</span>
                </div>
                <div className="h-3.5 rounded-full bg-[#0c1428] border border-[var(--line-soft)] overflow-hidden">
                  <div className="quota-fill h-full rounded-full" style={{ width: `${fill}%`, background: "linear-gradient(90deg, var(--yt-deep), var(--yt))" }} />
                </div>
                <div className="flex justify-between mt-4">
                  {[
                    ["10 000", "квота в сутки"],
                    ["≈ 6", "Shorts в день"],
                    ["0 ₽", "API бесплатен"],
                  ].map(([v, l]) => (
                    <div key={v}>
                      <p className="font-disp font-bold text-[17px]">{v}</p>
                      <p className="text-[11.5px] text-[var(--faint)] mt-0.5">{l}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* таблица лимитов */}
            <div className="card p-2.5" data-reveal style={{ "--rd": "140ms" } as React.CSSProperties}>
              <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
                <FilmIcon size={18} className="text-[var(--tg-soft)]" />
                <h3 className="font-disp font-bold text-[15px]">Лимиты, о которых бот уже знает</h3>
              </div>
              <div className="divide-y divide-[var(--line-soft)]">
                {LIMITS.map((r) => (
                  <div key={r.label} className="flex items-center gap-4 px-4 py-3 transition-colors duration-200 hover:bg-[rgba(42,171,238,0.045)] rounded-lg">
                    <p className="text-[13.5px] text-[var(--muted)] flex-1">{r.label}</p>
                    <p className="font-mono font-bold text-[13.5px] text-[var(--tg-soft)] whitespace-nowrap">{r.value}</p>
                    <p className="text-[12px] text-[var(--faint)] w-[38%] text-right hidden sm:block">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
