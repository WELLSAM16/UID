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

/** Daftar provinsi bawaan — dipakai bila API tidak bisa dijangkau. */
const PROVINCES_STATIC: Wilayah[] = [
  { id: "11", name: "ACEH" },
  { id: "12", name: "SUMATERA UTARA" },
  { id: "13", name: "SUMATERA BARAT" },
  { id: "14", name: "RIAU" },
  { id: "15", name: "JAMBI" },
  { id: "16", name: "SUMATERA SELATAN" },
  { id: "17", name: "BENGKULU" },
  { id: "18", name: "LAMPUNG" },
  { id: "19", name: "KEPULAUAN BANGKA BELITUNG" },
  { id: "21", name: "KEPULAUAN RIAU" },
  { id: "31", name: "DKI JAKARTA" },
  { id: "32", name: "JAWA BARAT" },
  { id: "33", name: "JAWA TENGAH" },
  { id: "34", name: "DI YOGYAKARTA" },
  { id: "35", name: "JAWA TIMUR" },
  { id: "36", name: "BANTEN" },
  { id: "51", name: "BALI" },
  { id: "52", name: "NUSA TENGGARA BARAT" },
  { id: "53", name: "NUSA TENGGARA TIMUR" },
  { id: "61", name: "KALIMANTAN BARAT" },
  { id: "62", name: "KALIMANTAN TENGAH" },
  { id: "63", name: "KALIMANTAN SELATAN" },
  { id: "64", name: "KALIMANTAN TIMUR" },
  { id: "65", name: "KALIMANTAN UTARA" },
  { id: "71", name: "SULAWESI UTARA" },
  { id: "72", name: "SULAWESI TENGAH" },
  { id: "73", name: "SULAWESI SELATAN" },
  { id: "74", name: "SULAWESI TENGGARA" },
  { id: "75", name: "GORONTALO" },
  { id: "76", name: "SULAWESI BARAT" },
  { id: "81", name: "MALUKU" },
  { id: "82", name: "MALUKU UTARA" },
  { id: "91", name: "PAPUA BARAT" },
  { id: "94", name: "PAPUA" },
];

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

export async function getProvinces(): Promise<Wilayah[]> {
  try {
    return await fetchList("provinces.json");
  } catch {
    return PROVINCES_STATIC;
  }
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
