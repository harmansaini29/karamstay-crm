def test_healthz_returns_ok_when_db_is_reachable(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
