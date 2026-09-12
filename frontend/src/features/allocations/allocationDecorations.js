import car from "../../assets/allocation-decorations/car.webp";
import education from "../../assets/allocation-decorations/education.webp";
import food from "../../assets/allocation-decorations/food.webp";
import gift from "../../assets/allocation-decorations/gift.webp";
import home from "../../assets/allocation-decorations/home.webp";
import love from "../../assets/allocation-decorations/love.webp";
import pet from "../../assets/allocation-decorations/pet.webp";
import plant from "../../assets/allocation-decorations/plant.webp";
import shopping from "../../assets/allocation-decorations/shopping.webp";
import travel from "../../assets/allocation-decorations/travel.webp";

export const ALLOCATION_DECORATIONS = Object.freeze([
  { key: "auto", label: "Otomatis", asset: null, keywords: [] },
  { key: "home", label: "Rumah", asset: home, keywords: ["rumah", "keluarga", "kontrakan", "kos", "apartemen"] },
  { key: "shopping", label: "Belanja", asset: shopping, keywords: ["belanja", "bulanan", "groceries", "sembako"] },
  { key: "love", label: "Love", asset: love, keywords: ["kesehatan", "obat", "dokter", "love", "cinta", "pasangan"] },
  { key: "education", label: "Pendidikan", asset: education, keywords: ["pendidikan", "sekolah", "kuliah", "kursus", "spp"] },
  { key: "travel", label: "Liburan", asset: travel, keywords: ["liburan", "travel", "mudik", "pesawat", "wisata"] },
  { key: "gift", label: "Hadiah", asset: gift, keywords: ["hadiah", "arisan", "ulang tahun", "kado"] },
  { key: "pet", label: "Hewan", asset: pet, keywords: ["hewan", "kucing", "anjing", "peliharaan", "pet"] },
  { key: "food", label: "Makanan", asset: food, keywords: ["makan", "makanan", "dapur", "kuliner", "restoran"] },
  { key: "car", label: "Mobil", asset: car, keywords: ["mobil", "kendaraan", "transport", "bensin", "servis", "parkir"] },
  { key: "plant", label: "Tanaman", asset: plant, keywords: ["tanaman", "kebun", "taman", "dekorasi"] },
]);

const decorationByKey = new Map(ALLOCATION_DECORATIONS.map((item) => [item.key, item]));
const fallbackKeys = ALLOCATION_DECORATIONS.filter((item) => item.key !== "auto").map((item) => item.key);

const stableHash = (value) => Array.from(String(value || "")).reduce((hash, character) => ((hash * 31) + character.codePointAt(0)) >>> 0, 2166136261);

export const normalizeAllocationDecorationKey = (value) => decorationByKey.has(String(value || "")) ? String(value) : "auto";

export const resolveAllocationDecorationKey = ({ decorationKey, name = "", id = "" } = {}) => {
  const normalized = normalizeAllocationDecorationKey(decorationKey);
  if (normalized !== "auto") return normalized;
  const haystack = String(name || "").trim().toLocaleLowerCase("id-ID");
  const keywordMatch = ALLOCATION_DECORATIONS.find((item) => item.key !== "auto" && item.keywords.some((keyword) => haystack.includes(keyword)));
  if (keywordMatch) return keywordMatch.key;
  return fallbackKeys[stableHash(name || id) % fallbackKeys.length] || "home";
};

export const allocationDecoration = ({ decorationKey, name, id } = {}) => decorationByKey.get(resolveAllocationDecorationKey({ decorationKey, name, id })) || decorationByKey.get("home");
