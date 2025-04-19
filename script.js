// Configuration\ nconst S3_BASE_URL = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
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
let travelData      = {};
let availableMonths = [];

// 1) Initialize globe with starry background as canvas backgroundImage
const globe = Globe()
  .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
  .showAtmosphere(true)
  .atmosphereColor('rgba(0, 150, 255, 0.2)')
  .width(window.innerWidth)
  .height(window.innerHeight)
  (globeContainer);

// 2) Zoom settings
const controls = globe.controls();
controls.enableZoom = true;
controls.zoomSpeed  = 20;

// 3) Default view: India
globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);

// Fetch a day's processed.json
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

// Load month's data
async function loadMonthData(date) {
  const key = date.toLocaleDateString('en-US', DATE_FORMAT);
  if (travelData[key]) return travelData[key];

  const year  = date.getFullYear();
  const month = String(date.getMonth()+1).padStart(2, '0');
  const days = new Date(year, date.getMonth()+1, 0).getDate();

  const perDay = await Promise.all(
    Array.from({ length: days }, (_, i) => fetchDay(year, month, i+1))
  );

  const locations = perDay.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
  travelData[key] = locations;
  if (!availableMonths.includes(key)) {
    availableMonths.push(key);
    availableMonths.sort((a,b) => new Date(a) - new Date(b));
  }
  return locations;
}

// Update globe
async function updateGlobe() {
  const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
  const locations = await loadMonthData(currentDate);

  timeDisplay.textContent = monthYear;
  const idx = availableMonths.indexOf(monthYear);
  prevMonthBtn.disabled = idx <= 0;
  nextMonthBtn.disabled = idx < 0 || idx === availableMonths.length-1;

  const arcs = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i+1];
    arcs.push({ startLat: a.lat, startLng: a.lng, endLat: b.lat, endLng: b.lng,
      color: [['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)'],['rgba(255,102,0,0.6)','rgba(255,102,0,0.3)']] });
  }

  globe.pointsData(locations)
    .pointLat(d => d.lat).pointLng(d => d.lng)
    .pointAltitude(0.01).pointRadius(0.7)
    .pointColor(() => 'rgba(255,102,0,0.8)')
    .pointLabel(d => `<div style="text-align:center"><div><b>${d.name}</b></div><div>${d.date}</div></div>`)
    .onPointHover(handlePointHover)
    .onPointClick(handlePointClick)
    .arcsData(arcs)
    .arcColor('color').arcDashLength(0.5).arcDashGap(1)
    .arcDashAnimateTime(2000).arcStroke(0.5).arcsTransitionDuration(1000);

  if (locations.length) {
    const lats = locations.map(d => d.lat), lngs = locations.map(d => d.lng);
    globe.pointOfView({ lat: (Math.min(...lats)+Math.max(...lats))/2,
                         lng: (Math.min(...lngs)+Math.max(...lngs))/2,
                         altitude: 2 }, 1000);
  }
}

// Tooltip hover
function handlePointHover(pt) {
  if (!pt) return tooltip.style.display='none';
  tooltip.style.display='block';
  const rect = globeContainer.getBoundingClientRect();
  tooltip.style.left=`${rect.left+10}px`;
  tooltip.style.top=`${rect.top+10}px`;
  tooltip.innerHTML=`<h3>${pt.name}</h3><p><em>${pt.date}</em></p><ul>${pt.summary.map(s=>`<li>${s}</li>`).join('')}</ul>`;
}

// Click info
function handlePointClick(pt) {
  if (!pt) return;
  globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude:1.5 },1000);
  infoPanel.style.display='block';
  infoPanel.innerHTML=`<h2>${pt.name}</h2><p><strong>Date:</strong> ${pt.date}</p><h3>Activities:</h3><ul>${pt.summary.map(s=>`<li>${s}</li>`).join('')}</ul><button onclick="infoPanel.style.display='none'">Close</button>`;
}

prevMonthBtn.addEventListener('click',()=>{const i=availableMonths.indexOf(currentDate.toLocaleDateString('en-US',DATE_FORMAT));if(i>0){currentDate=new Date(availableMonths[i-1]);updateGlobe();}});
nextMonthBtn.addEventListener('click',()=>{const i=availableMonths.indexOf(currentDate.toLocaleDateString('en-US',DATE_FORMAT));if(i>=0&&i<availableMonths.length-1){currentDate=new Date(availableMonths[i+1]);updateGlobe();}});
window.addEventListener('resize',()=>{globe.width(window.innerWidth).height(window.innerHeight);});
updateGlobe();
