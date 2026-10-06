/**
 * Master wilayah Indonesia (gratis, tanpa API key) — dipakai dropdown
 * berjenjang Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan di form EVP.
 * Sumber: https://github.com/emsifa/api-wilayah-indonesia (data Kemendagri).
 */
export interface Wilayah {
  id: string;
  name: string;
}

const BASE = "https://emsifa.github.io/api-wilayah-indonesia/api";

const cache = new Map<string, Wilayah[]>();

async function fetchList(path: string): Promise<Wilayah[]> {
  const hit = cache.get(path);
  if (hit) return hit;
  const res = await fetch(`${BASE}/${path}`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Wilayah API ${res.status}`);
  const data = (await res.json()) as Wilayah[];
  const list = Array.isArray(data) ? data : [];
  cache.set(path, list);
  return list;
}

export function getProvinces(): Promise<Wilayah[]> {
  return fetchList("provinces.json");
}

export function getRegencies(provinceId: string): Promise<Wilayah[]> {
  return fetchList(`regencies/${provinceId}.json`);
}

export function getDistricts(regencyId: string): Promise<Wilayah[]> {
  return fetchList(`districts/${regencyId}.json`);
}

export function getVillages(districtId: string): Promise<Wilayah[]> {
  return fetchList(`villages/${districtId}.json`);
}
