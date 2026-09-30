import heroCouple from "../../assets/allocation-ui/hero-couple.avif";
import emptyState from "../../assets/allocation-ui/empty-state.avif";
import categoryPicker from "../../assets/allocation-ui/category-picker.avif";
import successState from "../../assets/allocation-ui/success-state.avif";
import planningMale from "../../assets/allocation-ui/planning-male.avif";
import savingFemale from "../../assets/allocation-ui/saving-female.avif";

export const allocationArt = Object.freeze({
  heroCouple,
  emptyState,
  categoryPicker,
  successState,
  planningMale,
  savingFemale,
});

export const allocationQuickTemplates = Object.freeze([
  { key: "kebutuhan", label: "Kebutuhan", hint: "Belanja rumah, dapur, utilitas", art: categoryPicker, keywords: ["kebutuhan", "rumah tangga", "bulanan"], decorationKey: "shopping" },
  { key: "tabungan", label: "Tabungan", hint: "Dana aman untuk masa depan", art: savingFemale, keywords: ["tabungan", "dana darurat", "masa depan"], decorationKey: "gift" },
  { key: "investasi", label: "Investasi", hint: "Saham, reksa dana, emas", art: planningMale, keywords: ["investasi", "saham", "emas"], decorationKey: "plant" },
  { key: "kendaraan", label: "Kendaraan", hint: "Bensin, servis, cicilan", art: categoryPicker, keywords: ["kendaraan", "mobil", "motor"], decorationKey: "car" },
  { key: "kewajiban", label: "Kewajiban", hint: "Tagihan, cicilan, arisan", art: planningMale, keywords: ["kewajiban", "tagihan", "cicilan"], decorationKey: "home" },
  { key: "pendidikan", label: "Pendidikan", hint: "SPP, kursus, perlengkapan", art: categoryPicker, keywords: ["pendidikan", "sekolah", "kursus"], decorationKey: "education" },
  { key: "kesehatan", label: "Kesehatan", hint: "Dokter, obat, proteksi", art: successState, keywords: ["kesehatan", "dokter", "obat"], decorationKey: "love" },
  { key: "liburan", label: "Liburan", hint: "Jalan-jalan, mudik, staycation", art: heroCouple, keywords: ["liburan", "mudik", "jalan-jalan"], decorationKey: "travel" },
  { key: "lainnya", label: "Lainnya", hint: "Sesuaikan sendiri", art: emptyState, keywords: [], decorationKey: "home" },
]);
