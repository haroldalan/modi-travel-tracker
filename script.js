// Configuration
const S3_BASE_URL = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT  = { year: 'numeric', month: 'long' };

// DOM Elements
const globeContainer = document.getElementById('globe-container');
const tooltip        = document.querySelector('.tooltip');
const timeDisplay    = document.getElementById('time-display');
const prevMonthBtn   = document.getElementById('prev-month');
const nextMonthBtn   = document.getElementById('next-month');

// State
let currentDate     = new Date();
let travelData      = {};   // e.g. { "April 2025": [ …locations ] }
let availableMonths = [];

// Initialize globe
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// Make India the default view
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Load every day’s processed.json for a given month
async function loadMonthData(date) {
  const monthYear = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[monthYear]) return travelData[monthYear];

  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const daysInMonth = new Date(year, date.getMonth() + 1, 0).getDate();

  // Fetch each day’s JSON in parallel
  const fetches = Array.from({ length: daysInMonth }, (_, i) => {
    const dd  = String(i + 1).padStart(2, '0');
    const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
    return fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Day ${dd} not found`);
        return res.json();
      })
      .then(obj => {
        // Gracefully handle missing or empty locations
        if (!Array.isArray(obj.locations)) return [];
        // Attach the article-level date to each location
        return obj.locations.map(loc => ({
          ...loc,
          date: obj.date   // e.g. "2025-04-18"
        }));
      })
      .catch(err => {
        console.warn(err.message);
        return [];
      });
  });

  // Wait for all days, then flatten into one array
  const monthItems = (await Promise.all(fetches)).flat();

  // Map into the shape Three‑Globe expects
  const locations = monthItems
    .map(({ lat, lng, name, actions = [], date }) => ({
      lat,
      lng,
      name,
      date: new Date(date).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }),
      summary: actions.map(a => `• ${a}`)
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Cache and register this month
  travelData[monthYear] = locations;
  if (!availableMonths.includes(monthYear)) {
    availableMonths.push(monthYear);
    availableMonths.sort((a, b) => new Date(a) - new Date(b));
  }

  console.log(`Loaded ${locations.length} points for ${monthYear}`);
  return locations;
}

// Render the globe for the currentDate’s month
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // Update header & nav buttons
  timeDisplay.textContent      = monthYear;
  prevMonthBtn.disabled        = availableMonths.indexOf(monthYear) === 0;
  nextMonthBtn.disabled        = availableMonths.indexOf(monthYear) === availableMonths.length - 1;

  // Build arcs between consecutive points
  const arcs = [];
  for (let i = 0; i < locations.length - 1; i++) {
    arcs.push({
      startLat: locations[i].lat,
      startLng: locations[i].lng,
      endLat:   locations[i+1].lat,
      endLng:   locations[i+1].lng,
      color: [
        ['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)'],
        ['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)']
      ]
    });
  }

  // Plot points & arcs
  globe
    .pointsData(locations)
    .pointLat(d => d.lat)
    .pointLng(d => d.lng)
    .pointAltitude(0.01)
    .pointRadius(0.25)
    .pointColor(() => 'rgba(255, 102, 0, 0.8)')
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

  // If we have points, recenter the globe on them
  if (locations.length) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    globe.controls().autoRotateSpeed = 0.5;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// Month navigation handlers
prevMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx > 0) {
    currentDate = new Date(availableMonths[idx - 1]);
    updateGlobe();
  }
});
nextMonthBtn.addEventListener('click', () => {
  const idx = availableMonths.indexOf(currentDate.toLocaleDateString('en-US', DATE_FORMAT));
  if (idx < availableMonths.length - 1) {
    currentDate = new Date(availableMonths[idx + 1]);
    updateGlobe();
  }
});

// (Keep your existing hover/click tooltips)
function handlePointHover(pt) { /* … */ }
function handlePointClick(pt) { /* … */ }

// Make the globe responsive
window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// Kick everything off
updateGlobe();
