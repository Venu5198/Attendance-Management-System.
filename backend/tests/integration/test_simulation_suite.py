"""Integration test suite executing the Automated QA Worker Simulation cycles."""

import pytest

from scripts.simulate_worker_cycles import run_simulation


@pytest.mark.asyncio
async def test_worker_cycles_simulation_suite(test_db):
    """
    Execute end-to-end multi-archetype worker transaction cycles
    and assert policy evaluation accuracy.
    """
    report = await run_simulation()

    assert report["all_passed"] is True
    assert report["total_simulated_workers"] == 5
    assert report["total_violations_recorded"] == 1

    # Verify individual archetype results
    results_map = {r["employee_id"]: r for r in report["archetype_results"]}
    assert results_map["EMP_SIM_01"]["actual"] == "COMPLIANT"
    assert results_map["EMP_SIM_02"]["actual"] == "NON_COMPLIANT"
    assert results_map["EMP_SIM_03"]["actual"] == "COMPLIANT"
    assert results_map["EMP_SIM_04"]["actual"] == "COMPLIANT"
    assert results_map["EMP_SIM_05"]["actual"] == "COMPLIANT"
