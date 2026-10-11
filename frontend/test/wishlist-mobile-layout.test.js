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
  assert.match(css, /\.overview\{[^}]*padding:12px 14px;[^}]*background:var\(--surface-section\)/s);
  assert.match(css, /\.overview>\.overviewPrimary\{grid-column:1\/-1/);
  assert.match(css, /\.overview>div:not\(\.overviewPrimary\) small\{display:none\}/);
  assert.match(css, /\.empty\{min-height:160px;/);
  assert.match(responsive, /\.app-content\s*\{[^}]*padding:\s*16px var\(--mobile-page-gutter\) calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\)/);
});

test("Wishlist mobile priority filter is bounded, accessible, and works at narrow widths", async () => {
  const [page, css] = await Promise.all([
    read("src/features/wishlist/WishlistPage.jsx"),
    read("src/features/wishlist/WishlistPage.module.css"),
  ]);
  assert.match(page, /className=\{styles\.mobilePriority\}/);
  assert.match(page, /<SelectionControl ariaLabel="Filter prioritas" compact value=\{priority\} onChange=\{setPriority\}/);
  assert.match(css, /\.desktopPriority\{display:none\}/);
  assert.match(css, /\.mobilePriority :global\(\[role="combobox"\]\)\{[^}]*min-height:var\(--mobile-hit-target\)/s);
  assert.match(css, /\.mobilePriority :global\(\[data-selection-panel\]\)\{position:absolute/);
  assert.match(css, /@media\(max-width:380px\)\{[^}]*\.toolbar\{flex-wrap:wrap\}/s);
});
