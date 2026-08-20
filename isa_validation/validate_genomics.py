#!/usr/bin/env python3
"""Validate Genomics_elab2ARC_isa.json and write its report in this directory."""
import os
from isa_validate_lib import validate_and_report

HERE = os.path.dirname(os.path.abspath(__file__))

if __name__ == "__main__":
    validate_and_report(
        os.path.join(HERE, "Genomics_elab2ARC_isa.json"),
        os.path.join(HERE, "Genomics_elab2ARC_isa_validation_report.md"),
    )
