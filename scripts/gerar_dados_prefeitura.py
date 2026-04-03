#!/usr/bin/env python3
"""
Parses CSV files from Ribeirão Preto prefeitura and generates
a TypeScript data file for the NFSe emission form.
"""

import csv
import json
import os
from collections import OrderedDict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CNAE_CSV = os.path.join(BASE_DIR, "arq prefeitura", "CORRELACAO_CNAE_SUBITEMLC116_RIBEIRAOPRETO.csv")
NBS_CSV = os.path.join(BASE_DIR, "arq prefeitura", "CORRELACAO_NBS_SUBITEMLC116_RIBEIRAOPRETO.csv")
OUTPUT_TS = os.path.join(BASE_DIR, "portal", "src", "lib", "dados-prefeitura.ts")


def read_cnae_csv(filepath: str):
    """Read CNAE CSV and return dict of cnae_code -> {descricao, lc116_codes set}
    and dict of lc116_code -> descricao."""
    cnaes = OrderedDict()  # code -> {descricao, lc116: set}
    lc116_map = {}  # code -> descricao

    with open(filepath, encoding='latin-1', newline='') as f:
        reader = csv.reader(f, delimiter=';')
        header = next(reader)  # skip header
        for row in reader:
            if len(row) < 4:
                continue
            cnae_code = row[0].strip().strip('"')
            cnae_desc = row[1].strip().strip('"')
            lc116_code = row[2].strip().strip('"')
            lc116_desc = row[3].strip().strip('"')

            if not cnae_code or not lc116_code:
                continue

            if cnae_code not in cnaes:
                cnaes[cnae_code] = {'descricao': cnae_desc, 'lc116': []}
            if lc116_code not in cnaes[cnae_code]['lc116']:
                cnaes[cnae_code]['lc116'].append(lc116_code)

            if lc116_code not in lc116_map:
                lc116_map[lc116_code] = lc116_desc

    return cnaes, lc116_map


def read_nbs_csv(filepath: str):
    """Read NBS CSV and return dict of nbs_code -> {descricao, lc116_codes set}
    and dict of lc116_code -> descricao."""
    nbs_items = OrderedDict()
    lc116_map = {}

    with open(filepath, encoding='latin-1', newline='') as f:
        reader = csv.reader(f, delimiter=';')
        header = next(reader)  # skip header
        for row in reader:
            if len(row) < 4:
                continue
            nbs_code = row[0].strip().strip('"')
            nbs_desc = row[1].strip().strip('"')
            lc116_code = row[2].strip().strip('"')
            lc116_desc = row[3].strip().strip('"')

            if not nbs_code or not lc116_code:
                continue

            if nbs_code not in nbs_items:
                nbs_items[nbs_code] = {'descricao': nbs_desc, 'lc116': []}
            if lc116_code not in nbs_items[nbs_code]['lc116']:
                nbs_items[nbs_code]['lc116'].append(lc116_code)

            if lc116_code not in lc116_map:
                lc116_map[lc116_code] = lc116_desc

    return nbs_items, lc116_map


def escape_ts_string(s: str) -> str:
    """Escape a string for use in a TypeScript single-quoted string."""
    return s.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '')


def generate_typescript(cnaes, nbs_items, lc116_map):
    """Generate the TypeScript file content."""
    lines = []
    lines.append("// Auto-generated file - do not edit manually")
    lines.append("// Source: Prefeitura de Ribeirão Preto - Correlação CNAE/NBS x Subitem LC 116")
    lines.append("")

    # Interfaces
    lines.append("export interface CnaeItem {")
    lines.append("  codigo: string;")
    lines.append("  descricao: string;")
    lines.append("  lc116: string[];")
    lines.append("}")
    lines.append("")

    lines.append("export interface Lc116Item {")
    lines.append("  codigo: string;")
    lines.append("  descricao: string;")
    lines.append("}")
    lines.append("")

    lines.append("export interface NbsItem {")
    lines.append("  codigo: string;")
    lines.append("  descricao: string;")
    lines.append("  lc116: string[];")
    lines.append("}")
    lines.append("")

    # CNAES array
    lines.append("export const CNAES: CnaeItem[] = [")
    for code, data in cnaes.items():
        lc116_arr = json.dumps(data['lc116'])
        lines.append(f"  {{ codigo: '{escape_ts_string(code)}', descricao: '{escape_ts_string(data['descricao'])}', lc116: {lc116_arr} }},")
    lines.append("];")
    lines.append("")

    # LC116 items - sorted by code
    sorted_lc116 = sorted(lc116_map.items(), key=lambda x: [int(p) if p.isdigit() else p for p in x[0].replace('.', ' ').split()])
    lines.append("export const LC116_ITEMS: Lc116Item[] = [")
    for code, desc in sorted_lc116:
        lines.append(f"  {{ codigo: '{escape_ts_string(code)}', descricao: '{escape_ts_string(desc)}' }},")
    lines.append("];")
    lines.append("")

    # NBS items array
    lines.append("export const NBS_ITEMS: NbsItem[] = [")
    for code, data in nbs_items.items():
        lc116_arr = json.dumps(data['lc116'])
        lines.append(f"  {{ codigo: '{escape_ts_string(code)}', descricao: '{escape_ts_string(data['descricao'])}', lc116: {lc116_arr} }},")
    lines.append("];")
    lines.append("")

    # Lookup maps (built at module level for performance)
    lines.append("// Lookup maps")
    lines.append("const cnaeMap = new Map<string, CnaeItem>();")
    lines.append("for (const item of CNAES) { cnaeMap.set(item.codigo, item); }")
    lines.append("")
    lines.append("const nbsMap = new Map<string, NbsItem>();")
    lines.append("for (const item of NBS_ITEMS) { nbsMap.set(item.codigo, item); }")
    lines.append("")
    lines.append("const lc116Map = new Map<string, Lc116Item>();")
    lines.append("for (const item of LC116_ITEMS) { lc116Map.set(item.codigo, item); }")
    lines.append("")

    # Lookup functions
    lines.append("export function getLc116ByCnae(codigoCnae: string): Lc116Item[] {")
    lines.append("  const cnae = cnaeMap.get(codigoCnae);")
    lines.append("  if (!cnae) return [];")
    lines.append("  return cnae.lc116")
    lines.append("    .map((code) => lc116Map.get(code))")
    lines.append("    .filter((item): item is Lc116Item => item !== undefined);")
    lines.append("}")
    lines.append("")

    lines.append("export function getLc116ByNbs(codigoNbs: string): Lc116Item[] {")
    lines.append("  const nbs = nbsMap.get(codigoNbs);")
    lines.append("  if (!nbs) return [];")
    lines.append("  return nbs.lc116")
    lines.append("    .map((code) => lc116Map.get(code))")
    lines.append("    .filter((item): item is Lc116Item => item !== undefined);")
    lines.append("}")
    lines.append("")

    lines.append("export function searchCnae(query: string): CnaeItem[] {")
    lines.append("  const q = query.toLowerCase().trim();")
    lines.append("  if (!q) return [];")
    lines.append("  return CNAES.filter(")
    lines.append("    (item) => item.codigo.includes(q) || item.descricao.toLowerCase().includes(q)")
    lines.append("  );")
    lines.append("}")
    lines.append("")

    lines.append("export function searchNbs(query: string): NbsItem[] {")
    lines.append("  const q = query.toLowerCase().trim();")
    lines.append("  if (!q) return [];")
    lines.append("  return NBS_ITEMS.filter(")
    lines.append("    (item) => item.codigo.includes(q) || item.descricao.toLowerCase().includes(q)")
    lines.append("  );")
    lines.append("}")
    lines.append("")

    return '\n'.join(lines)


def main():
    print(f"Reading CNAE CSV: {CNAE_CSV}")
    cnaes, lc116_from_cnae = read_cnae_csv(CNAE_CSV)
    print(f"  Found {len(cnaes)} unique CNAE codes")
    print(f"  Found {len(lc116_from_cnae)} unique LC116 codes from CNAE")

    print(f"Reading NBS CSV: {NBS_CSV}")
    nbs_items, lc116_from_nbs = read_nbs_csv(NBS_CSV)
    print(f"  Found {len(nbs_items)} unique NBS codes")
    print(f"  Found {len(lc116_from_nbs)} unique LC116 codes from NBS")

    # Merge LC116 maps
    lc116_map = {**lc116_from_cnae, **lc116_from_nbs}
    print(f"  Total unique LC116 codes: {len(lc116_map)}")

    # Sample check for encoding
    sample_cnae = next(iter(cnaes.values()))
    print(f"\n  Sample CNAE desc: {sample_cnae['descricao']}")
    if nbs_items:
        sample_nbs = next(iter(nbs_items.values()))
        print(f"  Sample NBS desc: {sample_nbs['descricao']}")

    ts_content = generate_typescript(cnaes, nbs_items, lc116_map)

    os.makedirs(os.path.dirname(OUTPUT_TS), exist_ok=True)
    with open(OUTPUT_TS, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f"\nGenerated TypeScript file: {OUTPUT_TS}")
    print(f"  File size: {os.path.getsize(OUTPUT_TS):,} bytes")


if __name__ == '__main__':
    main()
