// script.js

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
const initialDate  = new Date();
const earliestDate = new Date(initialDate);
earestDate.setFullYear(earliestDate.getFullYear() - 2);

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

// Initialize Globe
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

// A group to hold our arrows
const arrowsGroup = new window.THREE.Group();
globe.scene().add(arrowsGroup);

// Helper to wipe out old arrows
function clearArrows() {
  while (arrowsGroup.children.length) {
    arrowsGroup.remove(arrowsGroup.children[0]);
  }
}

// Fetch one day’s JSON (or [] if missing)
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    const displayDate = new Date(obj.date)
      .toLocaleDateString('en-US', LABEL_OPTIONS);

    // New format: single location + actions
    if (obj.location) {
      return [{
        lat:     obj.location.lat,
        lng:     obj.location.lng,
        name:    obj.location.name,
        date:    displayDate,
        summary: obj.actions || []
      }];
    }
    // Fallback old format
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

// Convert lat/lng → Three.js Vector3 on unit sphere
function latLngToVector(lat, lng) {
  const φ = (90 - lat) * (Math.PI / 180);
  const θ = (lng + 180) * (Math.PI / 180);
  const r = globe.getGlobeRadius();
  return new window.THREE.Vector3(
    r * Math.sin(φ) * Math.cos(θ),
    r * Math.cos(φ),
    r * Math.sin(φ) * Math.sin(θ)
  );
}

// Tooltip hover\ nfunction handlePointHover(pt) {
  if (!pt) return tooltip.style.display = 'none';
  tooltip.style.display = 'block';
  const rect = globeContainer.getBoundingClientRect();
  tooltip.style.left  = `${rect.left + 10}px`; 
  tooltip.style.top   = `${rect.top  + 10}px`;
  tooltip.innerHTML = `
    <h3>${pt.name}</h3>
    <p><em>${pt.date}</em></p>
    <ul>${pt.summary.map(s => '<li>' + s + '</li>').join('')}</ul>
  `;
}

// Click to show info panel
function handlePointClick(pt) {
  if (!pt) return;
  globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.5 }, 1000);
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    <h2>${pt.name}</h2>
    <p><strong>Date:</strong> ${pt.date}</p>
    <h3>Activities:</h3>
    <ul>${pt.summary.map(s => '<li>' + s + '</li>').join('')}</ul>
    <button onclick="infoPanel.style.display='none'">Close</button>
  `;
}

// Update globe visualization
async function updateGlobe() {
  // Header + navigation
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  timeDisplay.textContent       = monthYear;
  prevMonthBtn.disabled = !isAfter(currentDate, earliestDate);
  nextMonthBtn.disabled = !isBefore(currentDate, initialDate);

  const locations = await loadMonthData(currentDate);

  // Clear old arrows and redraw
  clearArrows();
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i + 1];
    const start = latLngToVector(a.lat, a.lng);
    const end   = latLngToVector(b.lat, b.lng);
    const dir   = new window.THREE.Vector3().subVectors(end, start).normalize();
    const len   = start.distanceTo(end);

    const arrow = new window.THREE.ArrowHelper(
      dir, start, len,
      0xff6600, 0.3, 0.1
    );
    arrow.line.material.opacity     = 0.3;
    arrow.line.material.transparent = true;
    arrowsGroup.add(arrow);

    let growing = true;
    setInterval(() => {
      const s = arrow.cone.scale.x + (growing ? 0.005 : -0.005);
      arrow.setLength(len, s, s);
      growing = s < 0.5;
    }, 100);
  }

  // Plot points (smaller markers)
  globe
    .pointsData(locations)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointAltitude(0.01)
    .pointRadius(0.4)
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => `
      <div style="text-align:center">
        <div><b>${d.name}</b></div>
        <div>${d.date}</div>
      </div>
    `)
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick);

  // Auto‑center if there are points
  if (locations.length) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// Event listeners
prevMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  updateGlobe();
});
nextMonthBtn.addEventListener('click', () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  updateGlobe();
});

window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// Initial draw
updateGlobe();
