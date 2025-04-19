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
earliestDate.setFullYear(earliestDate.getFullYear() - 2);

// State
let currentDate = new Date(initialDate);
let travelData  = {};

// Helpers
function isBefore(a, b) {
  return a.getFullYear() < b.getFullYear()
      || (a.getFullYear() === b.getFullYear() && a.getMonth() < b.getMonth());
}
function isAfter(a, b) {
  return a.getFullYear() > b.getFullYear()
      || (a.getFullYear() === b.getFullYear() && a.getMonth() > b.getMonth());
}

/**
 * Convert lat/lng to 3D Cartesian coordinates on the globe
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} alt altitude factor (relative to globe radius)
 * @returns {THREE.Vector3}
 */
function latLngToXYZ(lat, lng, alt = 0) {
  const R = globe.globeRadius();                
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const r     = R * (1 + alt);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
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
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    const displayDate = new Date(obj.date)
      .toLocaleDateString('en-US', LABEL_OPTIONS);

    if (obj.location) {
      return [{
        lat:     obj.location.lat,
        lng:     obj.location.lng,
        name:    obj.location.name,
        date:    displayDate,
        summary: obj.actions || []
      }];
    }

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

// ——— Drawing the globe with static arrows ———

async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // header + nav buttons
  timeDisplay.textContent       = monthYear;
  prevMonthBtn.disabled = !isAfter(currentDate, earliestDate);
  nextMonthBtn.disabled = !isBefore(currentDate, initialDate);

  // plot points
  globe
    .pointsData(locations)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointAltitude(0.01)
    .pointRadius(0.7)
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => `
      <div style="text-align:center">
        <div><b>${d.name}</b></div>
        <div>${d.date}</div>
      </div>
    `)
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick);

  // remove old arrows
  globe.scene().children
    .filter(obj => obj.userData && obj.userData.isArrowHelper)
    .forEach(obj => globe.scene().remove(obj));

  // draw thin arrows
  locations.slice(0, -1).forEach((start, i) => {
    const end = locations[i + 1];
    const from = latLngToXYZ(start.lat, start.lng, 0.01);
    const to   = latLngToXYZ(end.lat, end.lng,     0.01);
    const dir  = new THREE.Vector3().subVectors(to, from).normalize();
    const len  = from.distanceTo(to);

    const arrow = new THREE.ArrowHelper(
      dir,         // direction
      from,        // origin
      len,         // length
      0xff6600,    // color (orange)
      0.05,        // headLength
      0.02         // headWidth
    );
    arrow.userData.isArrowHelper = true;
    globe.scene().add(arrow);
  });

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
  tooltip.style.left  = `${rect.left + 10}px`;
  tooltip.style.top   = `${rect.top  + 10}px`;

  tooltip.innerHTML = `
    <h3>${pt.name}</h3>
    <p><em>${pt.date}</em></p>
    <ul>${pt.summary.map(s => '<li>' + s + '</li>').join('')}</ul>
  `;
}

// click info‑panel
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

// Prev/Next month handlers
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

// initial draw
updateGlobe();
