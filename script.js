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

// Group to hold arrows
const arrowsGroup = new THREE.Group();
globe.scene().add(arrowsGroup);

// Clear existing arrows
function clearArrows() {
  while (arrowsGroup.children.length) {
    arrowsGroup.remove(arrowsGroup.children[0]);
  }
}

// Fetch one day’s JSON (or [] if missing)
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  console.log('Fetching data from URL:', url);
  try {
    const res = await fetch(url);
    console.log(`Response for ${url}:`, res.status, res.statusText);
    if (!res.ok) {
      console.warn(`No data for ${year}-${month}-${dd}`);
      return [];
    }
    const obj = await res.json();
    console.log('Fetched object:', obj);
    const displayDate = new Date(obj.date).toLocaleDateString('en-US', LABEL_OPTIONS);

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
    // Fallback to old format
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
    console.error('Error fetching day:', e);
    return [];
  }
}

// Load a month’s data
async function loadMonthData(date) {
  const key = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[key]) {
    console.log(`Using cache for ${key}`);
    return travelData[key];
  }

  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const days  = new Date(year, date.getMonth() + 1, 0).getDate();

  console.log(`Loading data for ${key} (${year}-${month}) with ${days} days`);
  const entries = await Promise.all(
    Array.from({ length: days }, (_, i) => fetchDay(year, month, i + 1))
  );

  const locations = entries.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`Loaded ${locations.length} locations for ${key}`);
  travelData[key] = locations;
  return locations;
}

// Convert lat/lng to 3D vector
function latLngToVector(lat, lng) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;
  const r = globe.getGlobeRadius();
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Tooltip hover handler
function handlePointHover(point) {
  if (!point) {
    tooltip.style.display = 'none';
    return;
  }
  tooltip.style.display = 'block';
  const rect = globeContainer.getBoundingClientRect();
  tooltip.style.left = `${rect.left + 10}px`;
  tooltip.style.top = `${rect.top + 10}px`;
  tooltip.innerHTML = `
    <h3>${point.name}</h3>
    <p><em>${point.date}</em></p>
    <ul>${point.summary.map(s => `<li>${s}</li>`).join('')}</ul>
  `;
}

// Point click handler
function handlePointClick(point) {
  if (!point) return;
  globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.5 }, 1000);
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    <h2>${point.name}</h2>
    <p><strong>Date:</strong> ${point.date}</p>
    <h3>Activities:</h3>
    <ul>${point.summary.map(s => `<li>${s}</li>`).join('')}</ul>
    <button onclick="infoPanel.style.display='none'">Close</button>
  `;
}

// Update the globe and arrows
async function updateGlobe() {
  console.log('Updating globe for', currentDate.toDateString());
  // Update header & buttons
  timeDisplay.textContent = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  prevMonthBtn.disabled = !isAfter(currentDate, earliestDate);
  nextMonthBtn.disabled = !isBefore(currentDate, initialDate);

  const locations = await loadMonthData(currentDate);
  console.log('Locations array:', locations);

  // Clear old arrows
  clearArrows();

  // Draw arrows
  locations.forEach((from, i) => {
    if (i === locations.length - 1) return;
    const to = locations[i + 1];
    const start = latLngToVector(from.lat, from.lng);
    const end   = latLngToVector(to.lat, to.lng);
    const dir   = new THREE.Vector3().subVectors(end, start).normalize();
    const len   = start.distanceTo(end);

    const arrow = new THREE.ArrowHelper(dir, start, len, 0xff6600, 0.3, 0.1);
    arrow.line.material.opacity = 0.3;
    arrow.line.material.transparent = true;
    arrowsGroup.add(arrow);

    // Pulse head
    let growing = true;
    setInterval(() => {
      const scale = arrow.cone.scale.x + (growing ? 0.005 : -0.005);
      arrow.setLength(len, scale, scale);
      growing = scale < 0.5;
    }, 100);
  });

  // Plot points
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

  // Auto-center
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
