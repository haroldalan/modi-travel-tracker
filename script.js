// Configuration
const S3_BASE_URL   = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT   = { year: 'numeric', month: 'long' };
const LABEL_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };

// DOM refs
const globeContainer = document.getElementById('globe-container');
const tooltip        = document.querySelector('.tooltip');
const infoPanel      = document.getElementById('info-panel');
const timeDisplay    = document.getElementById('time-display');
const prevMonthBtn   = document.getElementById('prev-month');
const nextMonthBtn   = document.getElementById('next-month');

// Date bounds
const initialDate  = new Date();                   // “Today”
const earliestDate = new Date(initialDate);
earliestDate.setFullYear(earliestDate.getFullYear() - 2);  // 2 yrs back

// State
let currentDate = new Date(initialDate);
let travelData  = {};  // cache monthKey → [locations]

// Helpers
function isBefore(a, b) {
  return a.getFullYear() < b.getFullYear()
      || (a.getFullYear() === b.getFullYear() && a.getMonth() < b.getMonth());
}
function isAfter(a, b) {
  return a.getFullYear() > b.getFullYear()
      || (a.getFullYear() === b.getFullYear() && a.getMonth() > b.getMonth());
}

// 🌐 Initialize Globe
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// Zoom tweaks
const controls = globe.controls();
controls.enableZoom = true;
controls.zoomSpeed  = 10;

// Default POV: India
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// ——— Data fetching ———

// Fetch one day’s JSON (or [] if missing)
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = ${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()};
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    const displayDate = new Date(obj.date)
      .toLocaleDateString('en-US', LABEL_OPTIONS);

    // NEW format: single location + actions
    if (obj.location) {
      return [{
        lat:   obj.location.lat,
        lng:   obj.location.lng,
        name:  obj.location.name,
        date:  displayDate,
        summary: obj.actions || []
      }];
    }
    // FALLBACK to old format: array of locations
    if (Array.isArray(obj.locations)) {
      return obj.locations.map(loc => ({
        lat:     loc.lat,
        lng:     loc.lng,
        name:    loc.name,
        date:    displayDate,
        summary: loc.actions || []
      }));
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Load an entire month’s worth of days
async function loadMonthData(date) {
  const key = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[key]) return travelData[key];

  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const days  = new Date(year, date.getMonth() + 1, 0).getDate();

  const perDay = await Promise.all(
    Array.from({ length: days }, (_, i) => fetchDay(year, month, i + 1))
  );

  const locations = perDay
    .flat()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  travelData[key] = locations;
  return locations;
}

// ——— Drawing the globe ———

async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // header + nav buttons
  timeDisplay.textContent       = monthYear;
  prevMonthBtn.disabled = !isAfter(currentDate, earliestDate);
  nextMonthBtn.disabled = !isBefore(currentDate, initialDate);

  // build arcs between sequential points
  const arcs = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i + 1];
    arcs.push({
      startLat: a.lat, startLng: a.lng,
      endLat:   b.lat, endLng:   b.lng,
      color: [
        ['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)'],
        ['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)']
      ]
    });
  }

  globe
    .pointsData(locations)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointAltitude(0.01)
    .pointRadius(0.7)
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => 
      <div style="text-align:center">
        <div><b>${d.name}</b></div>
        <div>${d.date}</div>
      </div>
    )
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick)
    .arcsData(arcs)
    .arcColor('color')
    .arcDashLength(0.5)
    .arcDashGap(1)
    .arcDashAnimateTime(2000)
    .arcStroke(0.5)
    .arcsTransitionDuration(1000);

  // auto‑center if there are points
  if (locations.length) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// hover tooltip
function handlePointHover(pt) {
  if (!pt) return tooltip.style.display = 'none';

  tooltip.style.display = 'block';
  const rect = globeContainer.getBoundingClientRect();
  tooltip.style.left  = ${rect.left + 10}px;
  tooltip.style.top   = ${rect.top  + 10}px;

  // NO nested backticks here — use single‑quoted strings:
  tooltip.innerHTML = 
    <h3>${pt.name}</h3>
    <p><em>${pt.date}</em></p>
    <ul>${pt.summary.map(s => '<li>' + s + '</li>').join('')}</ul>
  ;
}

// click info‑panel
function handlePointClick(pt) {
  if (!pt) return;

  globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.5 }, 1000);

  infoPanel.style.display = 'block';
  infoPanel.innerHTML = 
    <h2>${pt.name}</h2>
    <p><strong>Date:</strong> ${pt.date}</p>
    <h3>Activities:</h3>
    <ul>${pt.summary.map(s => '<li>' + s + '</li>').join('')}</ul>
    <button onclick="infoPanel.style.display='none'">Close</button>
  ;
}

// Prev/Next month handlers — fetch each month on demand
prevMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  updateGlobe();
});
nextMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  updateGlobe();
});

// resize handler
window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// initial draw (only current month is fetched)
updateGlobe();
