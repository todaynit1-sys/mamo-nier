"""Refresh Gyeonggi from supplied CSVs; requires pyproj==3.7.2 (PROJ)."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path


def normalize_name(value):
    value = re.sub(r'주식회사|유한회사|\(주\)|\(유\)', '', value)
    return re.sub(r'[\s·.,()㈜]', '', value)


def normalize_address(value):
    # Keep street/building numbers, units, branches and lot numbers.
    value = re.sub(r'\([^)]*\)', '', value).replace('번지', '')
    value = re.sub(r'^경기도\s*', '', value.strip())
    return re.sub(r'\s+', '', value)


def valid_position(lat, lon):
    # Sanity envelope, not a substitute for a cadastral or administrative boundary.
    return math.isfinite(lat) and math.isfinite(lon) and 36.8 <= lat <= 38.35 and 126.3 <= lon <= 127.95


def distance_m(a, b):
    lat1, lat2 = map(math.radians, [a[0], b[0]])
    dlat, dlon = lat2-lat1, math.radians(b[1]-a[1])
    q = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(q)))


def read_source(path, required):
    data = path.read_bytes()
    for encoding in ('utf-8-sig', 'cp949'):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise ValueError('Unsupported source encoding')
    rows = list(csv.DictReader(io.StringIO(text, newline='')))
    if not rows or not set(required) <= rows[0].keys():
        raise ValueError('Source is empty or required headers are missing')
    return rows, {'filename': path.name, 'sha256': hashlib.sha256(data).hexdigest(), 'rows': len(rows), 'encoding': encoding, 'dataDate': None}


def reconcile(province, national, transform):
    index = defaultdict(set)
    positions = {}
    stats = Counter()
    for i, row in enumerate(national, 2):
        if not (row['도로명주소'] or row['지번주소']).strip().startswith('경기도'):
            continue
        stats['moisGyeonggiRows'] += 1
        try:
            lon, lat = transform(float(row['좌표정보(X)']), float(row['좌표정보(Y)']))
            if valid_position(lat, lon):
                positions[i] = (round(lat, 8), round(lon, 8))
                stats['moisValidCoordinates'] += 1
        except (ValueError, OverflowError):
            pass
        for key in ('도로명주소', '지번주소'):
            address = normalize_address(row[key])
            if address and normalize_name(row['사업장명']):
                index[(normalize_name(row['사업장명']), address)].add(i)

    output, excluded, seen = [], [], set()
    for source_row, row in enumerate(province, 2):
        ids = set()
        for key in ('소재지도로명주소', '소재지지번주소'):
            ids.update(index.get((normalize_name(row['사업장명']), normalize_address(row[key])), ()))
        alternatives = {positions[i] for i in ids if i in positions}
        try:
            position = (float(row['WGS84위도']), float(row['WGS84경도']))
            if not valid_position(*position):
                position = None
        except ValueError:
            position = None
        source, mois_row, delta = 'gg', None, None
        if position:
            stats['provinceValidRows'] += 1
            if len(alternatives) == 1:
                delta = round(distance_m(position, next(iter(alternatives))), 1)
                if delta > 100:
                    stats['sourceDisagreementRowsOver100m'] += 1
        else:
            stats['provinceMissingOrInvalidRows'] += 1
            if len(alternatives) == 1:
                position, source = next(iter(alternatives)), 'mois'
                mois_row = min(i for i in ids if positions.get(i) == position)
                stats['recoveredRows'] += 1
            else:
                stats['excludedRows'] += 1
                reason = 'conflicting-mois-coordinates' if len(alternatives) > 1 else 'no-exact-coordinate-match'
                excluded.append({'provinceRow': source_row, 'reason': reason})
                continue
        address = (row['소재지도로명주소'] or row['소재지지번주소']).strip()
        address = re.sub(r'^경기도\s*', '', address)
        category = row['대기종별구분명'].strip().removesuffix('종') + '종'
        if category not in ('1종', '2종', '3종', '4종', '5종'):
            raise ValueError(f'Invalid category at province row {source_row}')
        record = [row['사업장명'].strip(), *position, category, row['업종명'].strip(), address]
        # Collapse only identical displayed facilities; never collapse a shared coordinate alone.
        duplicate_key = json.dumps(record, ensure_ascii=False)
        if duplicate_key in seen:
            stats['duplicateRowsRemoved'] += 1
            continue
        seen.add(duplicate_key)
        record.append([source, source_row, mois_row, delta])
        output.append(record)
    stats['displayedFacilities'] = len(output)
    stats['displayedProvinceCoordinates'] = sum(r[6][0] == 'gg' for r in output)
    stats['displayedMoisCoordinates'] = sum(r[6][0] == 'mois' for r in output)
    stats['displayedDisagreementsOver100m'] = sum((r[6][3] or 0) > 100 for r in output)
    assert len(province) == len(output) + stats['duplicateRowsRemoved'] + stats['excludedRows']
    return output, dict(stats), excluded


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--province', type=Path, required=True)
    parser.add_argument('--mois', type=Path, required=True)
    parser.add_argument('--applied-date', required=True, help='Import date; never an inferred source data date')
    args = parser.parse_args()
    from pyproj import Transformer, __version__
    if __version__ != '3.7.2':
        raise RuntimeError('Use the pinned pyproj==3.7.2')
    transform = Transformer.from_crs(5174, 4326, always_xy=True)
    province, pmeta = read_source(args.province, ('WGS84위도', 'WGS84경도', '사업장명', '소재지도로명주소', '소재지지번주소', '업종명', '대기종별구분명'))
    mois, mmeta = read_source(args.mois, ('좌표정보(X)', '좌표정보(Y)', '사업장명', '도로명주소', '지번주소'))
    rows, stats, excluded = reconcile(province, mois, transform.transform)
    meta = {'schema': 'mamo-facilities/1', 'region': '경기', 'appliedDate': args.applied_date,
            'dataDate': None, 'province': pmeta, 'mois': mmeta, 'statistics': stats,
            'coordinateSystems': {'province': 'EPSG:4326', 'mois': 'EPSG:5174', 'output': 'EPSG:4326', 'library': 'pyproj 3.7.2 / PROJ'},
            'policy': '도청 목록·WGS84 좌표 우선. 누락 좌표는 정규화 사업장명과 도로명 또는 지번주소가 모두 일치하고 유효 좌표가 하나일 때만 행안부로 보완. 도청 목록 밖 행안부 사업장은 추가하지 않음. 동일 표시행 중복 제거. 미확정 좌표는 지도·후보에서 제외.',
            'excluded': excluded}
    root = Path(__file__).resolve().parent.parent
    html_path = root / 'index.html'
    html = html_path.read_text(encoding='utf-8')
    pattern = r'(<script id="facData" type="application/json">)([\s\S]*?)(</script>)'
    match = re.search(pattern, html)
    data = json.loads(match[2]); data['경기'] = rows
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    html = html[:match.start(2)] + serialized + html[match.end(2):]
    provenance_tag = '<script id="facilityProvenance" type="application/json">' + json.dumps(meta, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + '</script>'
    html = re.sub(r'<script id="facilityProvenance" type="application/json">[\s\S]*?</script>\n?', '', html)
    html = html.replace('<script id="facData"', provenance_tag + '\n<script id="facData"', 1)
    html_path.write_text(html, encoding='utf-8', newline='\n')
    (root / 'docs' / 'gyeonggi-facilities-manifest.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(stats, ensure_ascii=False))


if __name__ == '__main__':
    main()
