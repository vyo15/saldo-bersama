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

test("dock dirender sebagai sibling shell agar fixed tetap mengikuti viewport", async () => {
  const source = await read("src/layouts/AppShell.jsx");
  const dockIndex = source.indexOf("<SideNavigation />");
  const shellIndex = source.indexOf('<div className={`app-shell');
  const headerIndex = source.indexOf('<header className="desktop-app-header">');
  const actionsIndex = source.indexOf('<div className="desktop-app-header__actions">');

  assert.ok(dockIndex >= 0, "dock harus dirender");
  assert.ok(shellIndex > dockIndex, "dock harus menjadi sibling sebelum shell, bukan child dari elemen backdrop-filter");
  assert.ok(headerIndex > shellIndex, "header tetap berada di dalam shell");
  assert.ok(actionsIndex > headerIndex, "header tetap memiliki action area");
});

test("navigasi mobile dirender sebagai sibling shell agar fixed tetap mengikuti viewport", async () => {
  const source = await read("src/layouts/AppShell.jsx");
  const shellIndex = source.indexOf('<div className={`app-shell');
  const shellEndIndex = source.indexOf("\n      </div>\n\n      {!dashboardRoute");
  const mobileNavigationIndex = source.indexOf("<MobileNavigation ");

  assert.ok(shellIndex >= 0, "shell aplikasi harus dirender");
  assert.ok(shellEndIndex > shellIndex, "shell harus ditutup sebelum kontrol fixed viewport");
  assert.ok(mobileNavigationIndex > shellEndIndex, "navigasi mobile harus menjadi sibling shell, bukan child dari backdrop-filter");
});

test("navigasi mobile memakai safe area dan menyisakan ruang scroll untuk konten terakhir", async () => {
  const responsiveCss = await read("src/styles/responsive.css");

  assert.match(responsiveCss, /--mobile-navigation-height:\s*68px;/);
  assert.match(responsiveCss, /html \{ scroll-padding-bottom:\s*calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\) \+ 12px\); \}/);
  assert.match(responsiveCss, /\.app-content \{[^}]*padding:\s*16px var\(--mobile-page-gutter\) calc\(var\(--mobile-navigation-height\) \+ env\(safe-area-inset-bottom\) \+ var\(--mobile-navigation-content-gap\)\);/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*position:\s*fixed;[^}]*inset-inline:\s*0;[^}]*bottom:\s*0;/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-left/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-right/);
  assert.match(responsiveCss, /\.mobile-navigation \{[^}]*safe-area-inset-bottom/);
  assert.match(responsiveCss, /\.app-shell--dashboard \.app-content \{[^}]*safe-area-inset-bottom/);
});


test("desktop memakai shell full-bleed tanpa gap viewport", async () => {
  const [appCss, responsiveCss] = await Promise.all([
    read("src/styles/app.css"),
    read("src/styles/responsive.css"),
  ]);

  assert.match(appCss, /\.app-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*100vh;[\s\S]*margin:\s*0;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-app-header\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(appCss, /\.desktop-module-dock\s*\{[\s\S]*position:\s*fixed;[\s\S]*top:\s*50%;[\s\S]*transform:\s*translateY\(-50%\);/);
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

test("layout mobile compact mempertahankan safe area dan target sentuh", async () => {
  const responsiveCss = await read("src/styles/responsive.css");

  assert.match(responsiveCss, /--mobile-navigation-height:\s*68px;/);
  assert.match(responsiveCss, /\.mobile-navigation a,\s*\n\s*\.mobile-navigation__more \{[^}]*min-height:\s*50px;/);
  assert.match(responsiveCss, /\.mobile-hero-button,\s*\n\s*\.mobile-finance-hero \.theme-toggle \{[^}]*min-height:\s*var\(--mobile-control-height\);/);
  assert.doesNotMatch(responsiveCss, /\.mobile-hero-button[^\{]*\{[^}]*width:\s*38px;/);
  assert.match(responsiveCss, /\.mobile-quick-action > span \{ width:\s*44px; height:\s*44px;/);
  assert.doesNotMatch(responsiveCss, /\.app-shell--dashboard \.topbar \{ display:\s*flex; \}/);
  assert.match(responsiveCss, /\.app-shell--dashboard \.topbar \{ display:\s*none; \}/);
});

test("logout tetap tersedia sampai navigasi mobile mengambil alih pada breakpoint 820/821/940/941", async () => {
  const [responsiveCss, mobileNavigation, navigationConfig] = await Promise.all([
    read("src/styles/responsive.css"),
    read("src/components/navigation/MobileNavigation.jsx"),
    read("src/config/navigation.js"),
  ]);

  const tabletBlock = responsiveCss.match(/@media \(max-width:\s*940px\) \{[\s\S]*?\n\}/)?.[0] || "";
  const mobileBlock = responsiveCss.match(/@media \(max-width:\s*820px\) \{[\s\S]*?\.mobile-navigation \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(tabletBlock, /\.desktop-user-avatar \{ display:\s*none; \}/);
  assert.doesNotMatch(tabletBlock, /desktop-logout-button[^}]*display:\s*none/);
  assert.match(mobileBlock, /\.desktop-app-header \{ display:\s*none; \}/);
  assert.match(mobileBlock, /\.mobile-navigation \{[^}]*display:\s*grid;/);
  assert.match(navigationConfig, /isMobileSecondaryNavigationPath/);
  assert.match(mobileNavigation, /secondaryRouteActive/);
  assert.match(mobileNavigation, /aria-current=\{secondaryRouteActive \? "page"/);
  assert.match(mobileNavigation, /mobile-navigation__more\$\{moreActive \? " active"/);
});
