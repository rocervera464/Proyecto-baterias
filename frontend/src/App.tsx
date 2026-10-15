import PredictionPage from "./pages/PredictionPage";
import { useRef } from "react";
import { useScrollReveal } from "./hooks/useScrollReveal";
import PredictionHeader from "./components/PredictionHeader";

import "./App.css";


function App() {
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);
  return (
    <div ref={pageRef}>
      <PredictionHeader />
      <main className="prediction-page">
        <PredictionPage />
      </main>
    </div>
  );
}


export default App;
