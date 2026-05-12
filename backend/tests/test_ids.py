import uuid
from app.core.ids import new_uuid


def test_new_uuid_is_valid_uuid4():
    result = new_uuid()
    uuid.UUID(result, version=4)


def test_new_uuid_is_unique():
    results = {new_uuid() for _ in range(100)}
    assert len(results) == 100
