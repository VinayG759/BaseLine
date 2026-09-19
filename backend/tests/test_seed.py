import importlib.util
from pathlib import Path

from core.services import aws_services
from core.trends import Reading

OWNER = "vinay@example.com"

spec = importlib.util.spec_from_file_location("seed_demo", Path(__file__).parent.parent / "scripts" / "seed_demo.py")
seed_demo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(seed_demo)


def test_seed_creates_the_demo_people_and_two_reports(configured_aws):
    seed_demo.seed(aws_services(), OWNER)

    services = aws_services()
    people = {p.display_name: p for p in services.list_people(OWNER)}
    assert set(people) == {"Mrs Sunita Rao", "Mr Ramesh Rao"}
    readings = services.load_readings(people["Mrs Sunita Rao"].person_id)
    assert sorted({r.taken_on for r in readings}) == ["2026-03-04", "2026-08-08"]
    assert len(readings) == 10
    assert services.load_readings(people["Mr Ramesh Rao"].person_id) == []


def test_seeding_twice_does_not_duplicate_anything(configured_aws):
    seed_demo.seed(aws_services(), OWNER)
    seed_demo.seed(aws_services(), OWNER)

    services = aws_services()
    assert len(services.list_people(OWNER)) == 2
    sunita = next(p for p in services.list_people(OWNER) if p.name == "Sunita Rao")
    assert len(services.load_readings(sunita.person_id)) == 10


def test_reset_removes_a_live_upload_and_restores_the_seed(configured_aws):
    services = aws_services()
    seed_demo.seed(services, OWNER)
    sunita = next(p for p in services.list_people(OWNER) if p.name == "Sunita Rao")
    services.save_readings(sunita.person_id, [Reading("hba1c", "HbA1c", 6.4, "%", 4.0, 5.6, "2026-09-12")], "live", "k")

    seed_demo.seed(services, OWNER, reset=True)

    dates = {r.taken_on for r in services.load_readings(sunita.person_id)}
    assert dates == {"2026-03-04", "2026-08-08"}
