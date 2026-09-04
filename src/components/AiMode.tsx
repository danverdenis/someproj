import AiDemo from "./AiDemo";
import { AI_STACK } from "../lib/content";
import { SectionHead } from "../lib/motion";

const GUARANTEES: [string, string][] = [
  ["Превью до публикации", "Бот присылает готовый ролик вам в чат — посмотрите, послушайте озвучку. На канал ничего не уходит, пока вы не нажмёте «Опубликовать»."],
  ["«Ещё дубль»", "Не понравилось — кнопка переснимает: сценарий переписывается с новым ракурсом, кадры рисуются с другим seed. Старый файл удаляется."],
  ["Один интерфейс на всё", "build_video(сценарий) → mp4. Появится ключ Runway, Kling или Veo — подмените одну функцию, остальной бот не изменится."],
];

export default function AiMode() {
  return (
    <section id="ai" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <SectionHead
          index="02"
          kicker="ai-режим"
          tone="ok"
          title={<>Пара строк — и бот <span className="text-[var(--ok)]">снимает сам</span></>}
          lead="Описываете идею парой строк: LLM пишет полноценный сценарий, бесплатные сервисы рисуют кадры и начитывают озвучку, ffmpeg склеивает ролик. Вы получаете превью — и только ваша кнопка решает, выйдет ли оно в Shorts."
        />

        <div className="mt-14 grid lg:grid-cols-[0.92fr_1.08fr] gap-14 lg:gap-12 items-start">
          {/* живое демо */}
          <div className="lg:sticky lg:top-24">
            <AiDemo />
          </div>

          {/* правая колонка */}
          <div className="space-y-6">
            {/* гарантии */}
            <div className="card p-6 sm:p-7" data-reveal>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--ok)]">решение всегда за вами</p>
              <div className="mt-4 space-y-4">
                {GUARANTEES.map(([t, d], i) => (
                  <div key={t} className="flex gap-3.5">
                    <span className="w-7 h-7 rounded-lg grid place-items-center shrink-0 font-mono text-[12px] font-bold mt-0.5"
                      style={{ background: "rgba(69,212,131,0.12)", color: "var(--ok)", boxShadow: "inset 0 0 0 1px rgba(69,212,131,0.35)" }}>
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[15px] font-bold">{t}</p>
                      <p className="text-[13.5px] text-[var(--muted)] leading-relaxed mt-1">{d}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* бесплатный стек */}
            <div data-reveal style={{ "--rd": "120ms" } as React.CSSProperties}>
              <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--faint)] mb-4">бесплатный стек генерации</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {AI_STACK.map((s) => {
                  const c = s.tone === "amber" ? "var(--amber)" : s.tone === "ok" ? "var(--ok)" : "var(--tg-soft)";
                  return (
                    <div key={s.name} className="card lift p-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-disp font-bold text-[15px]">{s.name}</p>
                        <span className="chip !text-[9.5px] !py-[2px] shrink-0" style={{ color: c, borderColor: c }}>{s.price}</span>
                      </div>
                      <p className="text-[13px] text-[var(--ink)] font-medium mt-2">{s.role}</p>
                      <p className="text-[12.5px] text-[var(--faint)] leading-relaxed mt-1.5">{s.note}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* честная приписка */}
            <div className="rounded-xl border px-5 py-4 flex gap-3.5 items-start" data-reveal
              style={{ borderColor: "rgba(255,180,84,0.3)", background: "rgba(255,180,84,0.05)", "--rd": "200ms" } as React.CSSProperties}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
                <path d="M12 10v4.2M12 16.8v.2" />
              </svg>
              <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
                <b className="text-[var(--amber)]">Честно про «нейровидео»:</b> полностью бесплатных API видеогенерации не бывает —
                поэтому бот собирает динамичный ролик из AI-кадров с эффектом Ken Burns и нейроозвучки. Это бесплатно всегда.
                А <code className="font-mono text-[12px] text-[var(--ink)]">build_video()</code> — единственная точка, куда подключается
                настоящий генератор, если появится ключ.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
