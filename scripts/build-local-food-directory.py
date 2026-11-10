"""Build the web food catalog from the 경기 CSV in the public 상가(상권)정보 ZIP.

Source: https://www.data.go.kr/data/15083033/fileData.do
Usage: python3 scripts/build-local-food-directory.py /path/to/download.zip
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import unicodedata
import zipfile

def display(value):
    return re.sub(r'\s+', ' ', value).strip()

def key(value):
    return ''.join(char for char in unicodedata.normalize('NFKC', value).lower() if char.isalnum())

def entry_name(name):
    try:
        return name.encode('cp437').decode('cp949')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name

def region_for(row):
    district = row['시군구명']
    neighborhoods = row['행정동명'] + ' ' + row['법정동명']
    if district.startswith('안산시'):
        return 'ansan'
    if district != '시흥시':
        return None
    if '배곧' in neighborhoods:
        return 'baegot'
    if any(name in neighborhoods for name in ('정왕', '거북섬')):
        return 'sihwa'
    return None

def catalog(rows):
    regions = {'ansan': {}, 'sihwa': {}, 'baegot': {}}
    for row in rows:
        if row['상권업종대분류명'] != '음식':
            continue
        region = region_for(row)
        if not region:
            continue
        category = display(row['상권업종소분류명'])
        if re.search(r'구내식당|출장 음식|이동 음식|유흥\s*주점|무도|주류', category):
            continue
        name = display(row['상호명'])
        branch = display(row['지점명'])
        if not name:
            continue
        if branch and key(branch) not in key(name):
            name += ' ' + branch
        address = display(row['도로명주소'] or row['지번주소'])
        if not name or not address or not row['상가업소번호']:
            continue
        identity = 'r' + hashlib.sha256(row['상가업소번호'].encode()).hexdigest()[:14]
        name_key = key(name)
        search_key = ' '.join(key(value) for value in [name, address, row['법정동명'], row['행정동명'], category])
        record = [identity, name, address.removeprefix('경기도 '), category, name_key, search_key]
        # Exact repeated listings at the same address should count as one place.
        dedup_key = (name_key, key(address))
        previous = regions[region].get(dedup_key)
        if previous is None or identity < previous[0]:
            regions[region][dedup_key] = record
    return {region: sorted(records.values(), key=lambda row: (row[4], row[2], row[0]))
            for region, records in regions.items()}

with zipfile.ZipFile(sys.argv[1]) as archive:
    candidates = [name for name in archive.namelist() if re.search(r'_경기_\d{6}\.csv$', entry_name(name))]
    if len(candidates) != 1:
        raise SystemExit('Expected exactly one 경기 CSV in the archive.')
    with archive.open(candidates[0]) as source:
        output = catalog(csv.DictReader(io.TextIOWrapper(source, encoding='utf-8-sig', newline='')))
if any(len(rows) < 100 for rows in output.values()):
    raise SystemExit('Unexpectedly few listings in a region; inspect the input and filters.')
if sum(len(rows) for rows in output.values()) != len({row[0] for rows in output.values() for row in rows}):
    raise SystemExit('Duplicate catalog IDs.')
target = Path(__file__).resolve().parent.parent / 'cloudflare' / 'local-food-directory.json'
target.write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(', '.join(f'{region}: {len(rows):,}' for region, rows in output.items()))
