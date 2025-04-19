// script.js

// Configuration
const S3_BASE_URL   = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT   = { year: 'numeric', month: 'long' };
const LABEL_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };

// DOM references
const globeContainer = document.getElementById('globe-container');
const tooltip        = document.querySelector('.tooltip');
const infoPanel      = document.getElementById('info-panel');
const timeDisplay    = document.getElementById('time-display');
const prevMonthBtn   = document.getElementById('prev-month');
const nextMonthBtn   = document.getElementById('next-month');

// State
let currentDate     = new Date();
let travelData      = {};    // cache per month
let availableMonths = [];

// Initialize globe with starry background
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// Zoom sensitivity
const controls = globe.controls();
controls.enableZoom = true;
controls.zoomSpeed  = 10;

// Default view: India
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Arrows container
const arrowsGroup = new window.THREE.Group();
globe.scene().add(arrowsGroup);

// Fetch one day's data (old logic)
async function fetchDay(year, month, day) {
  const dd = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    return (obj.locations || []).map(loc => ({
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      date: new Date(obj.date).toLocaleDateString('en-US', LABEL_OPTIONS),
      summary: loc.actions || []
    }));
  } catch {
    return [];
  }
}

// Load a full month's data by fetching days
async function loadMonthData(date) {
  const key = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[key]) return travelData[key];

  const year  = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2, '0');
  const days  = new Date(year, date.getMonth()+1, 0).getDate();

  const perDay = await Promise.all(
    Array.from({ length: days }, (_, i) => fetchDay(year, month, i+1))
  );

  const locations = perDay.flat()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  travelData[key] = locations;
  if (!availableMonths.includes(key)) {
    availableMonths.push(key);
    availableMonths.sort((a,b) => new Date(a) - new Date(b));
  }
  return locations;
}

// Clear existing arrows
function clearArrows() {
  while (arrowsGroup.children.length) {
    arrowsGroup.remove(arrowsGroup.children[0]);
  }
}

// Update globe
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // Update time display & nav buttons
  timeDisplay.textContent = monthYear;
  const idx = availableMonths.indexOf(monthYear);
  prevMonthBtn.disabled = idx <= 0;
  nextMonthBtn.disabled = idx < 0 || idx === availableMonths.length - 1;

  // Clear arrows
  clearArrows();

  // Draw subtle pulsing arrows
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i+1];
    // geo to 3D
    const φ1 = (90 - a.lat) * (Math.PI/180), θ1 = (a.lng+180) * (Math.PI/180);
    const φ2 = (90 - b.lat) * (Math.PI/180), θ2 = (b.lng+180) * (Math.PI/180);
    const r = globe.getGlobeRadius();
    const start = new window.THREE.Vector3(
      r * Math.sin(φ1)*Math.cos(θ1),
      r * Math.cos(φ1),
      r * Math.sin(φ1)*Math.sin(θ1)
    );
    const end = new window.THREE.Vector3(
      r * Math.sin(φ2)*Math.cos(θ2),
      r * Math.cos(φ2),
      r * Math.sin(φ2)*Math.sin(θ2)
    );
    const dir = end.clone().sub(start).normalize();
    const len = start.distanceTo(end);

    const arrow = new window.THREE.ArrowHelper(dir, start, len, 0xff6600, 0.3, 0.1);
    arrow.line.material.opacity = 0.3;
    arrow.line.material.transparent = true;
    arrowsGroup.add(arrow);

    // pulsing
    let grow = true;
    setInterval(() => {
      const s = arrow.cone.scale.x + (grow ? 0.005 : -0.005);
      arrow.setLength(len, s, s);
      grow = s < 0.5;
    }, 100);
  }

  // Plot points (smaller)
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
    const lats = locations.map(d => d.lat), lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats)+Math.max(...lats))/2;
    const centerLng = (Math.min(...lngs)+Math.max(...lngs))/2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// Tooltip hover
function handlePointHover(pt) {
  if (!pt) return tooltip.style.display = 'none';
  tooltip.style.display = 'block';
  const rect = globeContainer.getBoundingClientRect();
  tooltip.style.left = `${rect.left + 10}px`;
  tooltip.style.top  = `${rect.top  + 10}px`;
  tooltip.innerHTML  = `
    <h3>${pt.name}</h3>
    <p><em>${pt.date}</em></p>
    <ul>${pt.summary.map(s => `<li>${s}</li>`).join('')}</ul>
  `;
}

// Info-panel click
function handlePointClick(pt) {
  if (!pt) return;
  globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.5 }, 1000);
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    <h2>${pt.name}</h2>
    <p><strong>Date:</strong> ${pt.date}</p>
    <h3>Activities:</h3>
    <ul>${pt.summary.map(s => `<li>${s}</li>`).join('')}</ul>
    <button onclick="infoPanel.style.display='none'">Close</button>
  `;
}

// Navigation listeners
prevMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx > 0) { currentDate = new Date(availableMonths[idx-1]); updateGlobe(); }
});
nextMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx >= 0 && idx < availableMonths.length-1) { currentDate = new Date(availableMonths[idx+1]); updateGlobe(); }
});

// Handle resize
window.addEventListener('resize', () => globe.width(window.innerWidth).height(window.innerHeight));

// Start
updateGlobe();
