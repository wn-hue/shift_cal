#!/usr/bin/env python3
"""Bundle unchanged, offline business rules; --check fails on stale copies."""
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
names = ('account-data-core planner-core payroll-estimate payroll-sms holiday-work-pay-core '
         'day-scheduler-core day-memos-core day-entry-core google-sync-core salary-challenge '
         'bus-routes bus-stop-locations bus-factory-locations bus-location-core weather-forecast').split()
dest = root / 'ios-app' / 'NativeResources'
dest.mkdir(exist_ok=True)
stale = []
for name in names:
    source = (root / (name + '.js')).read_bytes()
    target = dest / (name + '.js')
    if args.check:
        if not target.exists() or source != target.read_bytes(): stale.append(name)
    else: target.write_bytes(source)
if stale: raise SystemExit('Native resources differ from web business rules: ' + ', '.join(stale))
print('Verified unchanged native resources' if args.check else 'Updated native resources')
