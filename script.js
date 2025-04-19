// Configuration
const S3_BASE_URL   = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT   = { year: 'numeric', month: 'long' };
const LABEL_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };

// DOM Elements
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

// Initialize globe and center on India
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// default POV: India
globe.controls().autoRotate = false;
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Fetch one day’s processed.json → array of locations (or [] on 404)
async function fetchDay(year, month, day) {
  const dd  = String(day).padStart(2, '0');
  const url = `${S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Not found');
    const obj = await res.json();
    // use the file’s own "date" field
    const fileDate = obj.date; 
    return (obj.locations || []).map(loc => ({
      lat:     loc.lat,
      lng:     loc.lng,
      name:    loc.name,
      date:    new Date(fileDate).toLocaleDateString('en-US', LABEL_OPTIONS),
      summary: loc.actions?.map(a => `• ${a}`) || []
    }));
  } catch {
    return [];
  }
}

// Load a full month’s data by hitting each day 1…N
async function loadMonthData(date) {
  const monthYear = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[monthYear]) return travelData[monthYear];

  const year        = date.getFullYear();
  const month       = String(date.getMonth() + 1).padStart(2, '0');
  const daysInMonth = new Date(year, date.getMonth()+1, 0).getDate();

  // fetch all days in parallel
  const perDay = await Promise.all(
    Array.from({ length: daysInMonth }, (_, i) => fetchDay(year, month, i+1))
  );

  // flatten & sort
  const locations = perDay
    .flat()
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // cache & register month
  travelData[monthYear] = locations;
  if (!availableMonths.includes(monthYear)) {
    availableMonths.push(monthYear);
    availableMonths.sort((a, b) => new Date(a) - new Date(b));
  }

  console.log(`Loaded ${locations.length} points for ${monthYear}`);
  return locations;
}

// Draw points & arcs for currentDate’s month
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  // update header & nav buttons
  timeDisplay.textContent = monthYear;
  const idx = availableMonths.indexOf(monthYear);
  prevMonthBtn.disabled = idx <= 0;
  nextMonthBtn.disabled = idx < 0 || idx === availableMonths.length - 1;

  // build arcs
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

  // plot
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
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick)
    .arcsData(arcs)
    .arcColor('color')
    .arcDashLength(0.5)
    .arcDashGap(1)
    .arcDashAnimateTime(2000)
    .arcStroke(0.5)
    .arcsTransitionDuration(1000);

  // re‑center if we have points
  if (locations.length) {
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
  }
}

// hover shows tooltip
function handlePointHover(pt) {
  if (pt) {
    tooltip.style.display = 'block';
    // position near top‑left of globe container
    const rect = globeContainer.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX + 10}px`;
    tooltip.style.top  = `${rect.top  + window.scrollY + 10}px`;
    tooltip.innerHTML = `
      <h3>${pt.name}</h3>
      <p><em>${pt.date}</em></p>
      <ul>${pt.summary.map(item => `<li>${item}</li>`).join('')}</ul>
    `;
  } else {
    tooltip.style.display = 'none';
  }
}

// click opens info‑panel
function handlePointClick(pt) {
  if (!pt) return;
  // focus globe
  globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.5 }, 1000);
  // populate panel
  infoPanel.style.display = 'block';
  infoPanel.innerHTML = `
    <h2>${pt.name}</h2>
    <p><strong>Date:</strong> ${pt.date}</p>
    <h3>Activities:</h3>
    <ul>${pt.summary.map(item => `<li>${item}</li>`).join('')}</ul>
    <button onclick="infoPanel.style.display='none'">Close</button>
  `;
}

// month nav
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

// resize handler
window.addEventListener('resize', () => {
  globe.width(window.innerWidth).height(window.innerHeight);
});

// kick off
updateGlobe();
