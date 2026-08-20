#!/usr/bin/env python3
"""Validate elabftw_demo_test_isa.json and write its report in this directory."""
import os
from isa_validate_lib import validate_and_report

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    validate_and_report(
        os.path.join(HERE, "elabftw_demo_test_isa.json"),
        os.path.join(HERE, "elabftw_demo_test_isa_validation_report.md"),
    )
