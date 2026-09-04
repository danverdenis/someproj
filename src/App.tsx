import Header from "./components/Header";
import Hero from "./components/Hero";
import Pipeline from "./components/Pipeline";
import Steps from "./components/Steps";
import CodeFiles from "./components/CodeFiles";
import Configurator from "./components/Configurator";
import Safety from "./components/Safety";
import Faq from "./components/Faq";
import Footer from "./components/Footer";
import { useRevealObserver } from "./lib/motion";

export default function App() {
  useRevealObserver();

  return (
    <div className="relative min-h-screen">
      {/* амбиентные слои */}
      <div className="bg-grid" aria-hidden />
      <div className="noise" aria-hidden />

      <Header />
      <main className="relative z-10">
        <Hero />
        <Pipeline />
        <Steps />
        <CodeFiles />
        <Configurator />
        <Safety />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
