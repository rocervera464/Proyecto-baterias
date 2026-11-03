from app.services.model_service import (
    get_model_service,
)


def test_model_service_loads_all_models():
    service = get_model_service()

    assert len(
        service.features
    ) == 29

    assert set(service.models) == {0}
    assert service.future_model is not None
    assert len(service.future_features) == 30

    assert (
        service.metadata[
            "model_family"
        ]
        == "XGBoost SoH v2"
    )
