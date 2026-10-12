from fastapi import FastAPI


app = FastAPI(
    title="Battery Prediction API",
    description=(
        "API para estimar el Estado de Salud (SoH) "
        "y la evolución futura de baterías EV."
    ),
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "message": "Battery Prediction API",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "battery-prediction-api",
        "version": "0.1.0",
    }