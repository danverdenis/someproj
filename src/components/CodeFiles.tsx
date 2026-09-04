import { useState } from "react";
import { CODE_FILES } from "../lib/content";
import { CopyButton, SectionHead } from "../lib/motion";

export default function CodeFiles() {
  const [tab, setTab] = useState(0);
  const file = CODE_FILES[tab];
  const lines = file.content.replace(/\n$/, "").split("\n");

  return (
    <section id="code" className="relative py-24 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          <SectionHead
            index="04"
            kicker="исходники"
            title={<>Два модуля — и бот <span className="text-[var(--tg-soft)]">в сборе</span></>}
            lead="main.py отвечает за Telegram и YouTube, ai_pipeline.py — за сценарии и сборку AI-роликов. Скопируйте файлы, заполните .env, запустите. Без баз данных, очередей и контейнеров."
          />
          <div className="flex flex-wrap gap-3 shrink-0" data-reveal>
            <span className="chip">Python 3.10+</span>
            <span className="chip">ffmpeg</span>
            <span className="chip">5 зависимостей</span>
          </div>
        </div>

        <div className="mt-10 card overflow-hidden" data-reveal>
          {/* вкладки файлов */}
          <div className="flex items-center gap-1 px-3 pt-3 border-b border-[var(--line-soft)] overflow-x-auto" style={{ background: "#0e1730" }}>
            {CODE_FILES.map((f, i) => (
              <button
                key={f.name}
                onClick={() => setTab(i)}
                className={`relative px-4 py-2.5 font-mono text-[12.5px] whitespace-nowrap transition-colors duration-200 cursor-pointer rounded-t-lg ${
                  tab === i ? "text-[var(--ink)] bg-[#0b1120]" : "text-[var(--faint)] hover:text-[var(--muted)]"
                }`}
              >
                {tab === i && (
                  <span className="absolute top-0 left-2 right-2 h-[2.5px] rounded-full" style={{ background: "linear-gradient(90deg, var(--tg), var(--yt))" }} />
                )}
                {f.name}
              </button>
            ))}
            <div className="ml-auto pb-2 pl-3 hidden sm:block">
              <CopyButton text={file.content} label={`копировать ${file.name}`} />
            </div>
          </div>

          <div className="px-4 py-2.5 flex items-center gap-2.5 border-b border-[var(--line-soft)] sm:hidden">
            <CopyButton text={file.content} label="копировать файл" />
          </div>

          {/* код с номерами строк */}
          <div className="relative">
            <div className="codebox !rounded-none !border-0 max-h-[540px] p-0 m-0">
              <table className="w-full border-collapse">
                <tbody>
                  {lines.map((ln, i) => (
                    <tr key={i} className="hover:bg-[rgba(42,171,238,0.045)] transition-colors">
                      <td className="ln pl-4 align-top select-none">{i + 1}</td>
                      <td className="pr-5 whitespace-pre-wrap break-all align-top">{ln || " "}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-[var(--line-soft)]" style={{ background: "#0e1730" }}>
            <p className="font-mono text-[12px] text-[var(--faint)]">
              <span className="text-[var(--tg-soft)]">{file.name}</span> — {file.note} · {lines.length} строк
            </p>
            <p className="font-mono text-[11px] text-[var(--faint)]">MIT · делайте что хотите, только ключи не коммитьте</p>
          </div>
        </div>

        {/* как сложить проект */}
        <div className="mt-6 grid md:grid-cols-3 gap-4" data-reveal>
          {[
            ["1 · папка проекта", "main.py, requirements.txt, .env, credentials.json — всё в /opt/shortsflow"],
            ["2 · pip install", "три пакета: telegram-клиент, google-api-клиент и oauth-хелпер"],
            ["3 · systemd", "юнит из комплекта держит бота онлайн 24/7 и рестартит при падении"],
          ].map(([t, d]) => (
            <div key={t} className="card lift p-5">
              <p className="font-mono text-[12.5px] text-[var(--amber)]">{t}</p>
              <p className="text-[13.5px] text-[var(--muted)] mt-1.5 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
