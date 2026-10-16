// Profile: pick your profile background from the skins you own, and your banner from the ones
// you've earned, without opening the profile screen. Uses the same client endpoints it does.

import { registerTab, lcu, jsonRequest, toast, escapeHtml } from "./core.js";

const PAGE_SIZE = 60;

const data = { summonerId: 0, backgroundSkinId: 0, skins: [], flags: [], equippedFlag: undefined, error: "" };
let search = "";
let shown = PAGE_SIZE;

async function prepare() {
  data.error = "";
  try {
    const summoner = await lcu("/lol-summoner/v1/current-summoner");
    data.summonerId = summoner.summonerId;
    const [profile, skins, flags, equipped] = await Promise.all([
      lcu("/lol-summoner/v1/current-summoner/summoner-profile"),
      lcu(`/lol-champions/v1/inventories/${summoner.summonerId}/skins-minimal`),
      lcu("/lol-banners/v1/current-summoner/flags").catch(() => []),
      lcu("/lol-banners/v1/current-summoner/flags/equipped").catch(() => undefined),
    ]);
    data.backgroundSkinId = profile?.backgroundSkinId ?? 0;
    // The client also lists each skin again for a separate game mode, under champion ids of
    // 60000 and up ("project_jade" art). Only regular champions belong here. Same-name, same-art
    // entries are shown once, preferring the one that's already your background.
    const seen = new Map();
    for (const skin of skins || []) {
      if (!skin.ownership?.owned || skin.disabled || !(skin.championId > 0 && skin.championId < 10000)) continue;
      const key = `${skin.name}|${skin.tilePath}`;
      if (!seen.has(key) || skin.id === data.backgroundSkinId) {
        seen.set(key, { id: skin.id, name: skin.name, tile: skin.tilePath, base: skin.isBase });
      }
    }
    data.skins = [...seen.values()].sort((left, right) => left.name.localeCompare(right.name));
    data.flags = (flags || []).sort((left, right) => (right.seasonId ?? 0) - (left.seasonId ?? 0) || (right.level ?? 0) - (left.level ?? 0));
    data.equippedFlag = equipped;
  } catch (error) {
    console.warn("[steeles-ui] Could not load your profile.", error);
    data.error = "Couldn't load your profile. Make sure you're logged in, then reopen this tab.";
  }
}

const flagKey = (flag) => `${flag?.itemId}:${flag?.level}`;

function flagName(flag) {
  const theme = String(flag.theme || "Banner").replace(/_/g, " ").replace(/([a-z])([A-Z0-9])/g, "$1 $2");
  return `${theme}${flag.level ? ` · level ${flag.level}` : ""}`;
}

function matchingSkins() {
  const query = search.trim().toLowerCase();
  return query ? data.skins.filter((skin) => skin.name.toLowerCase().includes(query)) : data.skins;
}

function skinGrid() {
  const skins = matchingSkins();
  if (!skins.length) return `<p class="field-note">${search ? "No owned skin matches that." : "No owned skins found."}</p>`;
  return `
    <div class="skin-grid">
      ${skins
        .slice(0, shown)
        .map(
          (skin) => `
        <button class="skin-tile${skin.id === data.backgroundSkinId ? " is-current" : ""}" type="button" data-pf-skin="${skin.id}" title="${escapeHtml(skin.name)}">
          <img src="${escapeHtml(skin.tile)}" alt="" loading="lazy" />
          <span>${escapeHtml(skin.name)}</span>
        </button>`,
        )
        .join("")}
    </div>
    ${skins.length > shown ? `<button class="button" type="button" data-pf-more>Show more (${skins.length - shown} left)</button>` : ""}`;
}

function renderTab() {
  if (data.error) return `<p class="field-note is-error">${escapeHtml(data.error)}</p>`;
  const current = data.skins.find((skin) => skin.id === data.backgroundSkinId);
  return `
    <div class="field is-stacked">
      <span class="field-copy"><strong>Profile background</strong><small>${current ? `Now: ${escapeHtml(current.name)}. ` : ""}Pick any of your ${data.skins.length} skins.</small></span>
      <input class="text-input" type="search" data-pf-search value="${escapeHtml(search)}" placeholder="Search your skins, e.g. Star Guardian" />
      <div data-pf-skins>${skinGrid()}</div>
    </div>
    <div class="field is-stacked section-start">
      <span class="field-copy"><strong>Banner</strong><small>The flag behind your profile and lobby card. You've earned ${data.flags.length}.</small></span>
      ${
        data.flags.length
          ? `<div class="flag-list">${data.flags
              .map(
                (flag) => `
            <button class="flag-row${flagKey(flag) === flagKey(data.equippedFlag) ? " is-current" : ""}" type="button" data-pf-flag="${escapeHtml(flagKey(flag))}">
              <strong>${escapeHtml(flagName(flag))}</strong>
              <small>${flag.seasonId ? `Season ${flag.seasonId}` : ""}${flagKey(flag) === flagKey(data.equippedFlag) ? " · equipped" : ""}</small>
            </button>`,
              )
              .join("")}</div>`
          : `<p class="field-note">You haven't earned any banners yet.</p>`
      }
    </div>`;
}

function bindTab(container) {
  const skinsBox = container.querySelector("[data-pf-skins]");
  const refreshSkins = () => {
    if (skinsBox) skinsBox.innerHTML = skinGrid();
  };
  container.querySelector("[data-pf-search]")?.addEventListener("input", (event) => {
    search = event.target.value;
    shown = PAGE_SIZE;
    refreshSkins();
  });

  container.addEventListener("click", async (event) => {
    if (event.target.closest("[data-pf-more]")) {
      shown += PAGE_SIZE;
      refreshSkins();
      return;
    }

    const skinButton = event.target.closest("[data-pf-skin]");
    if (skinButton) {
      const id = Number(skinButton.getAttribute("data-pf-skin"));
      const skin = data.skins.find((entry) => entry.id === id);
      try {
        await lcu("/lol-summoner/v1/current-summoner/summoner-profile", jsonRequest("POST", { key: "backgroundSkinId", value: id }));
        data.backgroundSkinId = id;
        refreshSkins();
        toast("success", `Profile background: ${skin?.name ?? "updated"}.`, { duration: 2500 });
      } catch (error) {
        console.warn("[steeles-ui] Could not set the profile background.", error);
        toast("error", "Couldn't change your profile background. Try again in a moment.");
      }
      return;
    }

    const flagButton = event.target.closest("[data-pf-flag]");
    if (flagButton) {
      const flag = data.flags.find((entry) => flagKey(entry) === flagButton.getAttribute("data-pf-flag"));
      if (!flag) return;
      try {
        await lcu("/lol-banners/v1/current-summoner/flags/equipped", jsonRequest("PUT", flag));
        data.equippedFlag = flag;
        container.innerHTML = renderTab();
        bindTab(container);
        toast("success", `Banner: ${flagName(flag)}.`, { duration: 2500 });
      } catch (error) {
        console.warn("[steeles-ui] Could not equip the banner.", error);
        toast("error", "Couldn't change your banner. Try again in a moment.");
      }
    }
  });
}

registerTab({ id: "profile", label: "Profile", prepare, render: renderTab, bind: bindTab });
