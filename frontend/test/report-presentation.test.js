import assert from "node:assert/strict";
import test from "node:test";
import { buildAllocationHealthModel } from "../src/features/reports/reportPresentation.js";

const allocation = (allocated, used, remaining = allocated - used) => ({
  allocated_amount: allocated,
  used_amount: used,
  remaining_amount: remaining,
});

test("indikator Kondisi Alokasi merangkum aman, perhatian, dan melewati secara proporsional", () => {
  const model = buildAllocationHealthModel([
    allocation(100, 30),
    allocation(100, 60),
    allocation(100, 79),
    allocation(100, 10),
    allocation(100, 80),
    allocation(100, 100),
    allocation(100, 120, -20),
  ]);

  assert.deepEqual(model.counts, { safe: 4, attention: 2, over: 1 });
  assert.equal(model.total, 7);
  assert.equal(model.reviewCount, 3);
  assert.equal(model.summary, "3 Alokasi perlu ditinjau");
  assert.equal(model.summaryTone, "warning");
  assert.equal(Math.round(model.segments.reduce((sum, segment) => sum + segment.percent, 0)), 100);
  assert.match(model.ariaLabel, /4 aman, 2 perhatian, 1 melewati/);
});

test("indikator Kondisi Alokasi memberi kesimpulan tenang saat semua Alokasi aman", () => {
  const model = buildAllocationHealthModel([
    allocation(500_000, 100_000),
    allocation(1_000_000, 0),
  ]);

  assert.deepEqual(model.counts, { safe: 2, attention: 0, over: 0 });
  assert.equal(model.reviewCount, 0);
  assert.equal(model.summary, "Semua Alokasi masih aman");
  assert.equal(model.summaryTone, "safe");
});

test("indikator Kondisi Alokasi aman untuk input kosong", () => {
  const model = buildAllocationHealthModel([]);

  assert.equal(model.total, 0);
  assert.deepEqual(model.counts, { safe: 0, attention: 0, over: 0 });
  assert.equal(model.segments.every((segment) => segment.percent === 0), true);
  assert.match(model.ariaLabel, /Belum ada Alokasi aktif/);
});
