// Configuration
const S3_BASE_URL = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT = { year: 'numeric', month: 'long' };
const LABEL_DATE_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };

// DOM Elements
const globeContainer = document.getElementById('globe-container');
const timeDisplay    = document.getElementById('time-display');
const prevMonthBtn   = document.getElementById('prev-month');
const nextMonthBtn   = document.getElementById('next-month');

// State
let currentDate     = new Date(); // starts at today
let travelData      = {};         // cache: { "April 2025": [ …locations ] }
let availableMonths = [];         // e.g. ["March 2025", "April 2025", …]

// Initialize globe, then set default India view
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// Center on India immediately (lat 20.5937, lng 78.9629)
globe.controls().autoRotate = false;
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Helper: fetch one day’s processed.json → array of point‑objects
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    const fileDate = obj.date; // e.g. "2025-04-18"
    return (obj.locations || []).map(loc => ({
      lat:     loc.lat,
      lng:     loc.lng,
      name:    loc.name,
      date:    new Date(fileDate).toLocaleDateString('en-US', LABEL_DATE_OPTIONS),
      summary: loc.actions?.map(a => `• ${a}`) || []
    }));
  } catch {
    return []; // skip missing or error
  }
}

// Load a full month’s data by hitting each day 1…daysInMonth
async function loadMonthData(date) {
  const monthYear = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[monthYear]) return travelData[monthYear];

  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const daysInMonth = new Date(year, date.getMonth()+1, 0).getDate();

  // Parallel fetch all days
  const perDayArrays = await Promise.all(
    Array.from({ length: daysInMonth }, (_, i) =>
      fetchDay(year, month, i + 1)
    )
  );

  // Flatten + sort by actual date
  const locations = perDayArrays
    .flat()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Cache & register this month
  travelData[monthYear] = locations;
  if (!availableMonths.includes(monthYear)) {
    availableMonths.push(monthYear);
    availableMonths.sort((a, b) => new Date(a) - new Date(b));
  }

  console.log(`Loaded ${locations.length} points for ${monthYear}`);
  return locations;
}

// Update the globe and UI for the currentDate’s month
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // Update header & buttons
  timeDisplay.textContent = monthYear;
  const idx = availableMonths.indexOf(monthYear);
  prevMonthBtn.disabled = idx <= 0;
  nextMonthBtn.disabled = idx < 0 || idx === availableMonths.length - 1;

  // Build arcs between consecutive points
  const arcs = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i+1];
    arcs.push({
      startLat: a.lat, startLng: a.lng,
      endLat:   b.lat, endLng:   b.lng,
      color: [
        ['rgba(255,102,0,0.6)', 'rgba(255,102,0,0.3)'],
        ['rgba(255,102,0,0.6)', 'rgba(255,102,0,0.3)']
      ]
    });
  }

  // Plot points + arcs
  globe
    .pointsData(locations)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointAltitude(0.01)
    .pointRadius(0.25)
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => `
      <div style="text-align:center">
        <div><b>${d.name}</b></div>
        <div>${d.date}</div>
      </div>
    `)
    // your existing handlers:
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick)
    .arcsData(arcs)
    .arcColor('color')
    .arcDashLength(0.5)
    .arcDashGap(1)
    .arcDashAnimateTime(2000)
    .arcStroke(0.5)
    .arcsTransitionDuration(1000);

  // If we have at least one point, re-center on that cluster
  if (locations.length > 0) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// Prev/Next month handlers
prevMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx > 0) {
    currentDate = new Date(availableMonths[idx - 1]);
    updateGlobe();
  }
});
nextMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx >= 0 && idx < availableMonths.length - 1) {
    currentDate = new Date(availableMonths[idx + 1]);
    updateGlobe();
  }
});

// Resize handler
window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// Kick it off
updateGlobe();
