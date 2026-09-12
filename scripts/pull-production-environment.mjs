import { checkProductionRuntime } from "./production-runtime.mjs";

console.log("Production memakai environment langsung dari Vercel; secret Sensitive tidak dipull ke workstation.");
console.log("Menjalankan health check deployment Production sebagai compatibility untuk env:pull/prepare:production...");
try {
  await checkProductionRuntime();
} catch (error) {
  console.error(error?.message || "Vercel Production belum siap.");
  process.exitCode = 1;
}
