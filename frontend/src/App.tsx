import { useAnimatedDetails } from "./hooks/useAnimatedDetails";
import PageNavigation from "./components/PageNavigation";
import PredictionPage from "./pages/PredictionPage";
import { useRef, useState } from "react";
import { useScrollReveal } from "./hooks/useScrollReveal";
import PredictionHeader from "./components/PredictionHeader";

import "./App.css";
import "./presentation.css";
import "./interactions.css";


function App() {
  const [hasResults, setHasResults] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);
  useAnimatedDetails();
  return (
    <div ref={pageRef}>
      <PageNavigation hasResults={hasResults} />
      <PredictionHeader />
      <main className="prediction-page">
        <PredictionPage onResultsChange={setHasResults} />
      </main>
    </div>
  );
}


export default App;
