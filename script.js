/* ── API ────────────────────────────────────────────────────────────── */
const API_BASES = [
  "https://de1.api.radio-browser.info/json/stations/search",
  "https://nl1.api.radio-browser.info/json/stations/search",
  "https://at1.api.radio-browser.info/json/stations/search",
];

const FETCH_HEADERS = {
  "User-Agent": "FFM/1.0 (https://ffm.lucc4w.space)",
  "Accept": "application/json",
};

/* ── State ──────────────────────────────────────────────────────────── */
const state = {
  allStations:       [],
  displayStations:   [],
  favorites:         JSON.parse(localStorage.getItem("ffm_favorites") || "[]"),
  activeIndex:       -1,
  activeStationUuid: null,
  isPlaying:         false,
  apiIndex:          0,
  displayCount:      10,
  hasMoreStations:   false,
};

/* ── DOM References ─────────────────────────────────────────────────── */
const form           = document.querySelector("#search-form");
const input          = document.querySelector("#search-input");
const stationList    = document.querySelector("#station-list");
const statusLine     = document.querySelector("#status-line");
const nowPlaying     = document.querySelector("#now-playing");
const audio          = document.querySelector("#audio-player");
const playButton     = document.querySelector("#play-button");
const previousButton = document.querySelector("#previous-button");
const nextButton     = document.querySelector("#next-button");
const volumeSlider   = document.querySelector("#volume-slider");
const volumeValue    = document.querySelector("#volume-value");
const loadMoreBtn    = document.querySelector("#load-more-button");
const loadMoreWrap   = document.querySelector("#load-more-wrapper");

audio.volume = Number(volumeSlider.value) / 100;

/* ── Helpers ────────────────────────────────────────────────────────── */
function setStatus(message, type = "") {
  statusLine.textContent = message;
  statusLine.className = "status-line" + (type ? ` is-${type}` : "");
}

function stationLabel(station) {
  return station.name.slice(0, 120);
}

function streamUrl(station) {
  return station.url_resolved || station.url;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}

function normalizeStations(stations) {
  const seen = new Set();
  return stations
    .filter((s) => s.name && streamUrl(s))
    .filter((s) => {
      const key = `${s.name}-${streamUrl(s)}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/* ── Skeleton Loading ───────────────────────────────────────────────── */
function renderSkeletons(count = 10) {
  stationList.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const div = document.createElement("div");
    div.className = "skeleton-card";
    stationList.appendChild(div);
  }
}

/* ── Fetch ──────────────────────────────────────────────────────────── */
async function fetchStations(term = "") {
  setStatus("Buscando rádios brasileiras…");
  renderSkeletons();
  loadMoreWrap.hidden = true;

  const baseParams = {
    countrycode: "BR",
    hidebroken:  "true",
    order:       "clickcount",
    reverse:     "true",
    limit:       "24",
  };

  const trimmedTerm = term.trim();
  const searches = trimmedTerm
    ? [{ name: trimmedTerm }, { state: trimmedTerm }, { tag: trimmedTerm }]
    : [{}];

  for (let attempt = 0; attempt < API_BASES.length; attempt += 1) {
    const index = (state.apiIndex + attempt) % API_BASES.length;

    try {
      const batches = await Promise.all(
        searches.map(async (search) => {
          const params = new URLSearchParams({ ...baseParams, ...search });
          const response = await fetch(`${API_BASES[index]}?${params.toString()}`, {
            headers: FETCH_HEADERS,
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
      );

      state.apiIndex    = index;
      state.allStations = normalizeStations(batches.flat());
      state.activeIndex = -1;

      renderStations();
      updateLoadMoreVisibility();

      if (state.allStations.length) {
        setStatus(`${state.allStations.length} rádios encontradas`);
      } else {
        setStatus("Nenhuma rádio encontrada para essa busca");
      }
      return;

    } catch (error) {
      console.error(`[FFM] API ${API_BASES[index]} falhou (tentativa ${attempt + 1}):`, error);
      if (attempt === API_BASES.length - 1) {
        stationList.innerHTML = "";
        setStatus("Não foi possível conectar ao Radio Browser. Verifique sua conexão.", "error");
      }
    }
  }
}

/* ── Render ─────────────────────────────────────────────────────────── */
function renderStations() {
  stationList.innerHTML = "";

  const toDisplay = [];
  state.favorites.forEach(fav => {
    toDisplay.push({ ...fav, isFavorite: true });
  });

  let consumed = 0;
  for (const station of state.allStations) {
    if (toDisplay.length >= Math.max(state.displayCount, state.favorites.length)) {
      break;
    }
    consumed++;
    if (!toDisplay.find(s => s.stationuuid === station.stationuuid)) {
      toDisplay.push({ ...station, isFavorite: false });
    }
  }

  state.hasMoreStations = consumed < state.allStations.length;
  state.displayStations = toDisplay;

  state.displayStations.forEach((station, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "station-card";
    button.dataset.index = index;
    
    if (station.stationuuid === state.activeStationUuid) {
      state.activeIndex = index;
      button.classList.add("is-active");
    }

    const tags     = station.tags ? station.tags.split(",").slice(0, 2).join(", ") : "";
    const location = station.state || station.country || "Brasil";
    const genre    = tags || station.language || "Rádio online";

    // Favicon: use the API favicon if available, otherwise a musical note emoji
    const faviconHTML = station.favicon
      ? `<img class="station-favicon" src="${escapeHtml(station.favicon)}" alt="" loading="lazy"
             onerror="this.replaceWith(makeFaviconPlaceholder())">`
      : `<span class="station-favicon-placeholder" aria-hidden="true">🎵</span>`;

    const heartIcon = station.isFavorite ? "♥" : "♡";

    button.innerHTML = `
      <div class="favorite-btn ${station.isFavorite ? 'is-favorite' : ''}" aria-label="Favoritar rádio">
        ${heartIcon}
      </div>
      ${faviconHTML}
      <span class="station-name">${escapeHtml(station.name)}</span>
      <span class="station-meta">${escapeHtml(location)}</span>
      <span class="station-meta">${escapeHtml(genre)}</span>
    `;
    button.addEventListener("click", () => selectStation(index));
    
    const favBtn = button.querySelector(".favorite-btn");
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(station);
    });

    stationList.appendChild(button);
  });
}

function toggleFavorite(station) {
  const index = state.favorites.findIndex(s => s.stationuuid === station.stationuuid);
  if (index > -1) {
    state.favorites.splice(index, 1);
  } else {
    if (state.favorites.length >= 5) {
      setStatus("Você já fixou 5 rádios favoritas.", "error");
      return;
    }
    const favObj = { ...station };
    delete favObj.isFavorite;
    state.favorites.push(favObj);
  }
  localStorage.setItem("ffm_favorites", JSON.stringify(state.favorites));
  renderStations();
}

// Helper used by onerror in img tags
function makeFaviconPlaceholder() {
  const span = document.createElement("span");
  span.className = "station-favicon-placeholder";
  span.setAttribute("aria-hidden", "true");
  span.textContent = "🎵";
  return span;
}
window.makeFaviconPlaceholder = makeFaviconPlaceholder;

function updateLoadMoreVisibility() {
  loadMoreWrap.hidden = !state.hasMoreStations;
}

/* ── Load More ──────────────────────────────────────────────────────── */
function loadMoreStations() {
  const newCount   = state.displayCount + 10;
  state.displayCount = newCount;
  renderStations();
  updateLoadMoreVisibility();
  setStatus(`Mostrando ${state.displayStations.length} rádios`);
}

/* ── Playback ───────────────────────────────────────────────────────── */
async function selectStation(index) {
  const station = state.displayStations[index];
  if (!station) return;

  state.activeIndex       = index;
  state.activeStationUuid = station.stationuuid;
  audio.src               = streamUrl(station);
  nowPlaying.textContent  = stationLabel(station);
  setActiveCard();
  await playCurrent();
}

async function playCurrent() {
  if (!audio.src && state.displayStations[0]) {
    await selectStation(0);
    return;
  }

  try {
    await audio.play();
    state.isPlaying = true;
    playButton.classList.remove("is-paused");
    setStatus("Tocando ao vivo", "live");
    updateMediaSession(state.displayStations[state.activeIndex]);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  } catch (error) {
    console.error("[FFM] Erro ao tentar reproduzir:", error);
    state.isPlaying = false;
    playButton.classList.add("is-paused");
    setStatus("A rádio bloqueou autoplay. Clique em tocar para tentar novamente.", "error");
  }
}

function pauseCurrent() {
  audio.pause();
  state.isPlaying = false;
  playButton.classList.add("is-paused");
  setStatus("Pausado");
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
}

function setActiveCard() {
  document.querySelectorAll(".station-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.index) === state.activeIndex);
  });
}

function moveStation(direction) {
  if (!state.displayStations.length) return;
  const nextIndex =
    state.activeIndex < 0
      ? 0
      : (state.activeIndex + direction + state.displayStations.length) % state.displayStations.length;
  selectStation(nextIndex);
}

/* ── Media Session ──────────────────────────────────────────────────── */
function updateMediaSession(station) {
  if (!("mediaSession" in navigator) || !station) return;
  const tags     = station.tags ? station.tags.split(",").slice(0, 2).join(", ") : "";
  const genre    = tags || station.language || "Rádio Online";
  const location = station.state || station.country || "Brasil";

  navigator.mediaSession.metadata = new MediaMetadata({
    title:   station.name,
    artist:  `${location} • ${genre}`,
    artwork: [
      { src: station.favicon || "https://ffm.lucc4w.space/logo.png", sizes: "512x512", type: "image/png" },
    ],
  });

  navigator.mediaSession.setActionHandler("play", playCurrent);
  navigator.mediaSession.setActionHandler("pause", pauseCurrent);
  navigator.mediaSession.setActionHandler("previoustrack", () => moveStation(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => moveStation(1));
}

/* ── Nav Active (IntersectionObserver) ──────────────────────────────── */
const navLinks = {
  inicio: document.querySelector("#nav-inicio"),
  radios: document.querySelector("#nav-radios"),
  sobre:  document.querySelector("#nav-sobre"),
};

const sections = ["inicio", "radios", "sobre"].map((id) => document.getElementById(id));

const sectionObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        Object.values(navLinks).forEach((a) => a && a.classList.remove("is-active"));
        const link = navLinks[entry.target.id];
        if (link) link.classList.add("is-active");
      }
    });
  },
  { threshold: 0.35 }
);

sections.forEach((s) => s && sectionObserver.observe(s));

/* ── Events ─────────────────────────────────────────────────────────── */
form.addEventListener("submit", (event) => {
  event.preventDefault();
  pauseCurrent();
  state.displayCount = 10;
  fetchStations(input.value);
});

let searchTimeout;
input.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    state.displayCount = 10;
    fetchStations(input.value);
  }, 350);
});

playButton.addEventListener("click", () => {
  if (state.isPlaying) pauseCurrent();
  else playCurrent();
});

previousButton.addEventListener("click", () => moveStation(-1));
nextButton.addEventListener("click", () => moveStation(1));

volumeSlider.addEventListener("input", () => {
  const volume = Number(volumeSlider.value);
  audio.volume = volume / 100;
  audio.muted  = volume === 0;
  volumeValue.textContent = `${volume}%`;
});

loadMoreBtn.addEventListener("click", loadMoreStations);

audio.addEventListener("error", () => {
  state.isPlaying = false;
  playButton.classList.add("is-paused");
  setStatus("Esta transmissão falhou. Tente outra rádio da lista.", "error");
});

audio.addEventListener("playing", () => {
  state.isPlaying = true;
  playButton.classList.remove("is-paused");
  setStatus("Tocando ao vivo", "live");
});

/* ── Smooth anchor links (single handler) ───────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    e.preventDefault();
    const targetId = anchor.getAttribute("href");
    const target = document.querySelector(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      history.pushState(null, "", window.location.pathname);
    }
  });
});

/* ── Init ───────────────────────────────────────────────────────────── */
fetchStations();