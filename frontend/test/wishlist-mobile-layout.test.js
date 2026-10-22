import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

test("Wishlist mobile keeps a compact accessible add action without changing desktop wording", async () => {
  const [page, css] = await Promise.all([
    read("src/features/wishlist/WishlistPage.jsx"),
    read("src/features/wishlist/WishlistPage.module.css"),
  ]);
  assert.match(page, /className=\{styles\.addAction\} aria-label="Tambah keinginan" icon=\{FiPlus\}/);
  assert.match(page, />Tambah keinginan<\/Button>/);
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /\.page :global\(\.page-header__actions \.button\)\{[^}]*width:var\(--mobile-hit-target\)/s);
  assert.match(css, /\.addAction>span\{display:none\}/);
});

test("Wishlist mobile merges summary into a compact surface and uses the shell bottom safe area", async () => {
  const [css, responsive] = await Promise.all([
    read("src/features/wishlist/WishlistPage.module.css"),
    read("src/styles/responsive.css"),
  ]);
  assert.match(css, /\.page\{gap:12px;padding-bottom:16px;min-width:0\}/);
  assert.match(css, /\.overview\{[^}]*padding:12px 14px;[^}]*background:var\(--tonal-gradient-purple\)/s);
  assert.match(css, /\.overview>div\{[^}]*padding:0;[^}]*background:transparent/s);
  assert.match(css, /\.overview>\.overviewPrimary\{flex:1\.3/);
  assert.match(css, /\.overview>div:not\(\.overviewPrimary\) small\{display:none\}/);
  assert.match(css, /\.empty\{min-height:160px;/);
  assert.match(responsive, /\.app-content\s*\{[^}]*padding:\s*16px var\(--mobile-page-gutter\) calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\)/);
});

test("Wishlist mobile uses an animated, accessible segmented ownership filter and bounded advanced modal", async () => {
  const [page, css] = await Promise.all([
    read("src/features/wishlist/WishlistPage.jsx"),
    read("src/features/wishlist/WishlistPage.module.css"),
  ]);
  assert.match(page, /className=\{styles\.scopeFilters\} data-scope=\{scope\} role="group" aria-label="Filter pemilik Wishlist"/);
  assert.match(page, /aria-pressed=\{scope === value\}/);
  assert.match(page, /aria-haspopup="dialog" onClick=\{\(\) => setFilterOpen\(true\)\}/);
  assert.match(page, /<WishlistFilterModal priority=\{priority\} showArchive=\{showArchive\}/);
  assert.match(page, /<Modal open onClose=\{onClose\} size="sm" title="Filter Wishlist">/);
  assert.match(page, /const \[draftPriority, setDraftPriority\] = useState\(priority\)/);
  assert.match(css, /\.scopeFilters\[data-scope="shared"\]::before\{transform:translateX\(200%\)\}/);
  assert.match(css, /transition:transform var\(--motion-normal\)/);
  assert.match(css, /\.mobileFilterButton\{[^}]*width:var\(--mobile-hit-target\)/s);
  assert.match(css, /@media\(max-width:360px\)/);
});

test("Wishlist simulation remains opt-in and keeps checkout separate", async () => {
  const [page, css] = await Promise.all([
    read("src/features/wishlist/WishlistPage.jsx"),
    read("src/features/wishlist/WishlistPage.module.css"),
  ]);
  assert.match(page, /const \[simulationMode, setSimulationMode\] = useState\(false\)/);
  assert.match(page, /simulationMode && item.status === "active"/);
  assert.match(page, /!simulationMode \? <button type="button" className=\{styles\.buyAction\}/);
  assert.match(page, /selected = active\.filter/);
  assert.match(page, /const exitSimulation = \(\) => \{ setSimulationMode\(false\); setSelectedIds\(\[\]\); setShowSimulator\(false\); \}/);
  assert.match(page, /simulationMode && showSimulator && selected.length/);
  assert.match(css, /\.itemPurchaseRow\{[^}]*flex-wrap:wrap/s);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("Wishlist loads financial forms on demand without increasing route bundle budget", async () => {
  const [page, layer] = await Promise.all([
    read("src/features/wishlist/WishlistPage.jsx"),
    read("src/features/wishlist/WishlistDialogLayer.jsx"),
  ]);
  assert.match(page, /const WishlistDialogLayer = lazy\(\(\) => import\("\.\/WishlistDialogLayer\.jsx"\)\)/);
  assert.match(page, /<Suspense fallback=\{<LazyActionFallback surface="modal"/);
  assert.doesNotMatch(page, /import (MoneyInput|SelectionField|TemporalInput) from/);
  assert.match(layer, /const WishlistEditor =/);
  assert.match(layer, /const WishlistCheckout =/);
  assert.match(layer, /const WishlistSimulator =/);
  assert.match(layer, /useGuardedMutation\(\)/);
  assert.match(layer, /purchaseWishlist\(/);
});
