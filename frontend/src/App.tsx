import PredictionPage from "./pages/PredictionPage";
import PredictionHeader from "./components/PredictionHeader";

import "./App.css";


function App() {
  return (
    <>
      <PredictionHeader />
      <main className="prediction-page">
        <PredictionPage />
      </main>
    </>
  );
}


export default App;
