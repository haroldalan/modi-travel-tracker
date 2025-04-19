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

// State
let currentDate     = new Date();
let travelData      = {};    // cache per month
let availableMonths = [];

// Initialize globe
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// Transparent canvas to reveal the body background
globe.renderer().setClearAlpha(0);

// Zoom sensitivity & controls
const controls = globe.controls();
controls.enableZoom = true;
controls.zoomSpeed  = 10; // further increased

// Default view: India
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Fetch a day's processed.json → locations array
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    return (obj.locations || []).map(loc => ({
      lat:     loc.lat,
      lng:     loc.lng,
      name:    loc.name,
      date:    new Date(obj.date).toLocaleDateString('en-US', LABEL_OPTIONS),
      summary: loc.actions || []
    }));
  } catch {
    return [];
  }
}

// Load month data by fetching days in parallel
async function loadMonthData(date) {
  const monthYear = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[monthYear]) return travelData[monthYear];

  const year  = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2, '0');
  const days = new Date(year, date.getMonth()+1, 0).getDate();

  const perDay = await Promise.all(
    Array.from({ length: days }, (_, i) => fetchDay(year, month, i+1))
  );

  const locations = perDay
    .flat()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  travelData[monthYear] = locations;
  if (!availableMonths.includes(monthYear)) {
    availableMonths.push(monthYear);
    availableMonths.sort((a,b) => new Date(a) - new Date(b));
  }

  console.log(`Loaded ${locations.length} points for ${monthYear}`);
  return locations;
}

// Update globe with current month
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // UI updates
  timeDisplay.textContent = monthYear;
  const idx = availableMonths.indexOf(monthYear);
  prevMonthBtn.disabled = idx <= 0;
  nextMonthBtn.disabled = idx < 0 || idx === availableMonths.length - 1;

  // Build arcs
  const arcs = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i+1];
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
    .pointRadius(0.7)           // increased marker size
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => `
      <div style="text-align:center">
        <div><b>${d.name}</b></div>
        <div>${d.date}</div>
      </div>
    `)
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick)
    .arcsData(arcs)
    .arcColor('color')
    .arcDashLength(0.5)
    .arcDashGap(1)
    .arcDashAnimateTime(2000)
    .arcStroke(0.5)
    .arcsTransitionDuration(1000);

  // Auto-center
  if (locations.length) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats)+Math.max(...lats))/2;
    const centerLng = (Math.min(...lngs)+Math.max(...lngs))/2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// Hover tooltip
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

// Click info-panel
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

// Month nav
document.getElementById('prev-month').addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx > 0) currentDate = new Date(availableMonths[idx-1]), updateGlobe();
});
document.getElementById('next-month').addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx >= 0 && idx < availableMonths.length-1) currentDate = new Date(availableMonths[idx+1]), updateGlobe();
});

// Resize
window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// Start
updateGlobe();
