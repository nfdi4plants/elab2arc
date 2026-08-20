#!/usr/bin/env python3
"""Shared ISA-JSON validation + report-generation logic.

Used by the per-file validate_*.py scripts in this directory. Each of those
just calls validate_and_report(json_path, report_path) with its own file.
"""
import json
import os
import sys

sys.path.insert(0, "/Users/xr/git/elab2arc/isa-api")

from isatools import isajson


def collect_study_stats(studies):
    study_stats = []
    for study in studies:
        assays = study.get('assays', [])
        protocols = study.get('protocols', [])
        process_seq = study.get('processSequence', [])
        assay_procs = sum(len(a.get('processSequence', [])) for a in assays)
        default_count = 0
        for assay in assays:
            for proc in assay.get('processSequence', []):
                ep = proc.get('executesProtocol', {})
                if ep.get('@id') == '#Protocol/_default':
                    default_count += 1
        study_stats.append({
            'identifier': study.get('identifier', 'N/A'),
            'has_assays': len(assays) > 0,
            'num_assays': len(assays),
            'num_protocols': len(protocols),
            'num_study_processes': len(process_seq),
            'num_assay_processes': assay_procs,
            'total_processes': len(process_seq) + assay_procs,
            'default_protocol_count': default_count,
            'num_sources': len(study.get('materials', {}).get('sources', [])),
            'num_samples': len(study.get('materials', {}).get('samples', [])),
            'num_otherMaterials': len(study.get('materials', {}).get('otherMaterials', [])),
            'has_dataFiles_all': all('dataFiles' in a for a in assays) if assays else True,
            'has_unitCategories_all': all('unitCategories' in a for a in assays) if assays else True,
            'has_filename_all': all('filename' in a for a in assays) if assays else True,
        })
    return study_stats


def validate_and_report(json_path, report_path):
    """Validate json_path with isatools.isajson.validate and write a markdown
    report to report_path. Returns (status, num_errors, num_warnings)."""
    filename = os.path.basename(json_path)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    with open(json_path, 'r', encoding='utf-8') as fp:
        report = isajson.validate(fp, log_level=None)

    studies = data.get('studies', [])
    study_stats = collect_study_stats(studies)

    status = 'PASSED' if len(report['errors']) == 0 else 'FAILED'

    lines = []
    lines.append('# ISA-JSON Validation Report')
    lines.append('')
    lines.append('**File:** `' + filename + '`')
    lines.append('**Size:** ' + str(round(os.path.getsize(json_path) / 1024, 1)) + ' KB')
    lines.append('**Date:** Generated on demand')
    lines.append('**Validator:** ISA-API (isatools.isajson.validate)')
    lines.append('')
    lines.append('---')
    lines.append('')
    lines.append('## Validation Result')
    lines.append('')
    lines.append('| Metric | Value |')
    lines.append('|--------|-------|')
    lines.append('| Status | **' + status + '** |')
    lines.append('| Errors | ' + str(len(report['errors'])) + ' |')
    lines.append('| Warnings | ' + str(len(report['warnings'])) + ' |')
    lines.append('')

    if report['errors']:
        lines.append('### Errors')
        lines.append('')
        for i, err in enumerate(report['errors'], 1):
            code = err.get('code', 'N/A')
            msg = err.get('message', '')
            sup = err.get('supplemental', '')
            lines.append(str(i) + '. **[' + str(code) + ']** ' + msg)
            if sup:
                lines.append('   - ' + sup)
        lines.append('')

    if report['warnings']:
        by_code = {}
        for w in report['warnings']:
            code = w.get('code', 'N/A')
            by_code.setdefault(code, []).append(w)
        lines.append('### Warnings by Code')
        lines.append('')
        for code, warns in sorted(by_code.items(), key=lambda kv: str(kv[0])):
            lines.append('**Code ' + str(code) + '** (' + str(len(warns)) + ' warnings)')
            lines.append('')
            for w in warns[:3]:
                msg = w.get('message', '')
                sup = w.get('supplemental', '')
                lines.append('- ' + msg + ': ' + sup[:200] + ('...' if len(sup) > 200 else ''))
            if len(warns) > 3:
                lines.append('- ... and ' + str(len(warns) - 3) + ' more')
            lines.append('')

    lines.append('---')
    lines.append('')
    lines.append('## Structural Analysis')
    lines.append('')
    lines.append('| Property | Value |')
    lines.append('|----------|-------|')
    lines.append('| Studies | ' + str(len(studies)) + ' |')
    lines.append('| Ontology Sources | ' + str(len(data.get('ontologySourceReferences', []))) + ' |')
    lines.append('| People | ' + str(len(data.get('people', []))) + ' |')
    lines.append('| Publications | ' + str(len(data.get('publications', []))) + ' |')
    lines.append('')

    for i, s in enumerate(study_stats, 1):
        lines.append('### Study ' + str(i) + ': `' + s['identifier'] + '`')
        lines.append('')
        lines.append('| Property | Value |')
        lines.append('|----------|-------|')
        lines.append('| Assays | ' + str(s['num_assays']) + ' |')
        lines.append('| Protocols | ' + str(s['num_protocols']) + ' |')
        lines.append('| Study-level processes | ' + str(s['num_study_processes']) + ' |')
        lines.append('| Assay-level processes | ' + str(s['num_assay_processes']) + ' |')
        lines.append('| Total processes | ' + str(s['total_processes']) + ' |')
        lines.append('| Processes using `_default` | ' + str(s['default_protocol_count']) + ' |')
        lines.append('| Sources | ' + str(s['num_sources']) + ' |')
        lines.append('| Samples | ' + str(s['num_samples']) + ' |')
        lines.append('| Other Materials | ' + str(s['num_otherMaterials']) + ' |')
        lines.append('| All assays have `dataFiles` | ' + ('Yes' if s['has_dataFiles_all'] else 'No') + ' |')
        lines.append('| All assays have `unitCategories` | ' + ('Yes' if s['has_unitCategories_all'] else 'No') + ' |')
        lines.append('| All assays have `filename` | ' + ('Yes' if s['has_filename_all'] else 'No') + ' |')
        lines.append('')

    lines.append('---')
    lines.append('')
    lines.append('## Protocol Breakdown')
    lines.append('')
    for i, s in enumerate(study_stats, 1):
        study = studies[i - 1]
        lines.append('### Study ' + str(i) + ': `' + s['identifier'] + '`')
        lines.append('')
        lines.append('| Protocol @id | Name | Parameters |')
        lines.append('|--------------|------|------------|')
        for p in study.get('protocols', []):
            pid = p.get('@id', 'N/A')
            pname = p.get('name', 'N/A')
            nparams = len(p.get('parameters', []))
            lines.append('| `' + pid + '` | ' + pname + ' | ' + str(nparams) + ' |')
        lines.append('')

    lines.append('---')
    lines.append('')
    lines.append('## Assay Breakdown')
    lines.append('')
    for i, s in enumerate(study_stats, 1):
        study = studies[i - 1]
        lines.append('### Study ' + str(i) + ': `' + s['identifier'] + '`')
        lines.append('')
        lines.append('| Assay @id | Filename | Processes | `executesProtocol` |')
        lines.append('|-----------|----------|-----------|--------------------|')
        for assay in study.get('assays', []):
            fname = assay.get('filename', 'N/A')
            nprocs = len(assay.get('processSequence', []))
            ep_set = set()
            for proc in assay.get('processSequence', []):
                ep = proc.get('executesProtocol', {})
                ep_set.add(ep.get('@id', 'NONE'))
            ep_str = '<br>'.join(sorted(ep_set))
            aid = assay.get('@id', 'N/A')
            lines.append('| `' + aid + '` | ' + fname + ' | ' + str(nprocs) + ' | ' + ep_str + ' |')
        lines.append('')

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print('Validated:', filename)
    print('  Report written to:', report_path)
    print('  Status:', status)
    print('  Errors:', len(report['errors']))
    print('  Warnings:', len(report['warnings']))
    for code in sorted({w.get('code', 'N/A') for w in report['warnings']}, key=str):
        count = sum(1 for w in report['warnings'] if w.get('code') == code)
        print('    Code', code, ':', count)

    return status, len(report['errors']), len(report['warnings'])
