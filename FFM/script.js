const API_BASES = [
  "https://de1.api.radio-browser.info/json/stations/search",
  "https://nl1.api.radio-browser.info/json/stations/search",
  "https://at1.api.radio-browser.info/json/stations/search",
];

const state = {
  stations: [],
  allStations: [],
  activeIndex: -1,
  isPlaying: false,
  apiIndex: 0,
  displayCount: 10,
};

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const stationList = document.querySelector("#station-list");
const statusLine = document.querySelector("#status-line");
const nowPlaying = document.querySelector("#now-playing");
const audio = document.querySelector("#audio-player");
const playButton = document.querySelector("#play-button");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const volumeSlider = document.querySelector("#volume-slider");
const volumeValue = document.querySelector("#volume-value");
const radiosMenuLink = document.querySelector('a[href="#radios"]');

audio.volume = Number(volumeSlider.value) / 100;

function setStatus(message) {
  statusLine.textContent = message;
}

function stationLabel(station) {
  return station.name.slice(0, 120);
}

function streamUrl(station) {
  return station.url_resolved || station.url;
}

function normalizeStations(stations) {
  const seen = new Set();

  return stations
    .filter((station) => station.name && streamUrl(station))
    .filter((station) => {
      const key = `${station.name}-${streamUrl(station)}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchStations(term = "") {
  setStatus("Buscando radios brasileiras...");
  stationList.innerHTML = "";

  const baseParams = {
    countrycode: "BR",
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    limit: "24",
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
          const response = await fetch(`${API_BASES[index]}?${params.toString()}`);
          if (!response.ok) throw new Error("Resposta invalida da API");
          return response.json();
        })
      );

      state.apiIndex = index;
      state.allStations = normalizeStations(batches.flat());
      state.stations = state.allStations.slice(0, state.displayCount);
      state.activeIndex = -1;
      renderStations();

      if (state.stations.length) {
        setStatus(`${state.stations.length} radios encontradas`);
      } else {
        setStatus("Nenhuma radio encontrada para essa busca");
      }
      return;
    } catch (error) {
      if (attempt === API_BASES.length - 1) {
        setStatus("Nao foi possivel conectar ao Radio Browser agora");
      }
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadMoreStations() {
  const newCount = state.displayCount + 10;
  state.stations = state.allStations.slice(0, newCount);
  state.displayCount = newCount;
  renderStations();
  setStatus(`${state.stations.length} radios carregadas`);
}

function renderStations() {
  stationList.innerHTML = "";

  state.stations.forEach((station, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "station-card";
    button.dataset.index = index;
    const tags = station.tags ? station.tags.split(",").slice(0, 2).join(", ") : "";
    const location = station.state || station.country || "Brasil";
    const genre = tags || station.language || "Radio online";
    button.innerHTML = `
      <span class="station-name">${escapeHtml(station.name)}</span>
      <span class="station-meta">${escapeHtml(location)}</span>
      <span class="station-meta">${escapeHtml(genre)}</span>
    `;
    button.addEventListener("click", () => selectStation(index));
    stationList.appendChild(button);
  });
}

async function selectStation(index) {
  const station = state.stations[index];
  if (!station) return;

  state.activeIndex = index;
  audio.src = streamUrl(station);
  nowPlaying.textContent = stationLabel(station);
  setActiveCard();
  await playCurrent();
}

async function playCurrent() {
  if (!audio.src && state.stations[0]) {
    await selectStation(0);
    return;
  }

  try {
    await audio.play();
    state.isPlaying = true;
    playButton.classList.remove("is-paused");
    setStatus("Tocando ao vivo");
  } catch (error) {
    state.isPlaying = false;
    playButton.classList.add("is-paused");
    setStatus("A radio bloqueou autoplay. Clique em tocar para tentar novamente.");
  }
}

function pauseCurrent() {
  audio.pause();
  state.isPlaying = false;
  playButton.classList.add("is-paused");
  setStatus("Pausado");
}

function setActiveCard() {
  document.querySelectorAll(".station-card").forEach((card) => {
    card.classList.toggle("is-active", Number(card.dataset.index) === state.activeIndex);
  });
}

function moveStation(direction) {
  if (!state.stations.length) return;
  const nextIndex =
    state.activeIndex < 0
      ? 0
      : (state.activeIndex + direction + state.stations.length) % state.stations.length;
  selectStation(nextIndex);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  pauseCurrent();
  fetchStations(input.value);
});

let searchTimeout;
input.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    fetchStations(input.value);
  }, 300);
});

playButton.addEventListener("click", () => {
  if (state.isPlaying) {
    pauseCurrent();
  } else {
    playCurrent();
  }
});

previousButton.addEventListener("click", () => moveStation(-1));
nextButton.addEventListener("click", () => moveStation(1));

volumeSlider.addEventListener("input", () => {
  const volume = Number(volumeSlider.value);
  audio.volume = volume / 100;
  audio.muted = volume === 0;
  volumeValue.textContent = `${volume}%`;
});

radiosMenuLink.addEventListener("click", (event) => {
  event.preventDefault();
  if (state.stations.length > 0) {
    loadMoreStations();
  }
  document.querySelector("#radios").scrollIntoView({ behavior: "smooth" });
});

audio.addEventListener("error", () => {
  state.isPlaying = false;
  playButton.classList.add("is-paused");
  setStatus("Esta transmissao falhou. Tente outra radio da lista.");
});

audio.addEventListener("playing", () => {
  state.isPlaying = true;
  playButton.classList.remove("is-paused");
});

fetchStations();
