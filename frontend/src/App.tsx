import PredictionPage from "./pages/PredictionPage";
import PredictionHeader from "./components/PredictionHeader";

import "./App.css";


function App() {
  return (
    <main className="prediction-page">
      <PredictionHeader />
      <PredictionPage />
    </main>
  );
}


export default App;
