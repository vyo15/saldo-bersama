import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("desktop memakai floating module dock IMS tanpa mengubah sumber route", async () => {
  const source = await read("src/components/navigation/SideNavigation.jsx");

  assert.match(source, /PRIMARY_NAVIGATION\.map/);
  assert.match(source, /desktop-module-dock/);
  assert.match(source, /sidebar-rail-mask\.svg/);
  assert.match(source, /sidebar-rail-mask-dark\.svg/);
  assert.match(source, /aria-label="Navigasi utama Saldo Bersama"/);
  assert.match(source, /aria-label=\{`Buka \$\{label\}`\}/);
  assert.match(source, /data-label=\{label\}/);
});

test("dock dirender di shell tetapi tidak lagi memenuhi header desktop", async () => {
  const source = await read("src/layouts/AppShell.jsx");
  const dockIndex = source.indexOf("<SideNavigation />");
  const headerIndex = source.indexOf('<header className="desktop-app-header">');
  const actionsIndex = source.indexOf('<div className="desktop-app-header__actions">');

  assert.ok(dockIndex >= 0, "dock harus dirender");
  assert.ok(headerIndex > dockIndex, "dock harus berada di luar header desktop");
  assert.ok(actionsIndex > headerIndex, "header tetap memiliki action area");
});


test("desktop memakai shell full-bleed tanpa gap viewport", async () => {
  const [appCss, responsiveCss] = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
  ]);

  assert.match(appCss, /\.app-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100vh;[\s\S]*margin:\s*0;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-app-header\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*inset-inline-start:\s*0;/);
  assert.match(appCss, /\.app-content\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;[\s\S]*margin-inline:\s*0;/);
  assert.match(responsiveCss, /@media \(max-width:\s*940px\)[\s\S]*\.app-shell \{ width:\s*100%; min-height:\s*100vh; margin:\s*0; border-radius:\s*0; \}/);
});

test("geometri rail mengikuti IMS dan menyisakan navigasi mobile", async () => {
  const [appCss, responsiveCss, mobileNavigation] = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
    read("src/components/navigation/MobileNavigation.jsx"),
  ]);

  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*width:\s*92px;[\s\S]*height:\s*480px;/);
  assert.match(appCss, /\.desktop-module-dock__navigation\s*\{[\s\S]*inset-inline-start:\s*15px;/);
  assert.match(appCss, /\.desktop-module-dock__link\.is-active::after/);
  assert.match(appCss, /height:\s*22px;/);
  assert.match(responsiveCss, /@media \(max-width:\s*820px\)[\s\S]*\.desktop-module-dock \{ display:\s*none; \}/);
  assert.match(responsiveCss, /\.app-shell__main \{ padding-inline-start:\s*0; \}/);
  assert.match(mobileNavigation, /MOBILE_PRIMARY_NAVIGATION/);
});

test("asset rail light dan dark mempertahankan path organik IMS", async () => {
  const [light, dark] = await Promise.all([
    read("src/assets/layout/sidebar-rail-mask.svg"),
    read("src/assets/layout/sidebar-rail-mask-dark.svg"),
  ]);
  const organicPath = "M0 0C0 28 15 48 56 66C80 81 91 100 92 128V352C91 380 80 399 56 414C15 432 0 452 0 480V0Z";

  assert.match(light, /width="92" height="480"/);
  assert.match(dark, /width="92" height="480"/);
  assert.ok(light.includes(organicPath));
  assert.ok(dark.includes(organicPath));
});
