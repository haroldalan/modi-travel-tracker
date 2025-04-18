// Configuration
const S3_BASE_URL = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const DATE_FORMAT = { year: 'numeric', month: 'long' };

// DOM Elements
const globeContainer = document.getElementById('globe-container');
const tooltip = document.querySelector('.tooltip');
const timeDisplay = document.getElementById('time-display');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// State
let currentDate = new Date(); // Track current month being viewed
let travelData = {}; // { "January 2023": [...locations], "February 2023": [...] }
let availableMonths = []; // ["January 2023", "February 2023", ...]

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

// Load data for a specific month
async function loadMonthData(date) {
    const monthYear = date.toLocaleDateString('en-US', DATE_FORMAT);
    
    // If we already have this month's data, return it
    if (travelData[monthYear]) {
        return travelData[monthYear];
    }

    try {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const s3Url = `${S3_BASE_URL}/${year}/${month}/processed.json?t=${Date.now()}`;
        
        const response = await fetch(s3Url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const rawData = await response.json();
        
        // Process locations for this month
        const locations = rawData.locations.map(loc => ({
            lat: loc.lat,
            lng: loc.lng,
            name: loc.name,
            date: new Date(loc.date).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
            }),
            summary: loc.actions?.map(action => `• ${action}`) || []
        }));
        
        // Store the processed data
        travelData[monthYear] = locations;
        
        // Update available months list if needed
        if (!availableMonths.includes(monthYear)) {
            availableMonths.push(monthYear);
            availableMonths.sort((a, b) => new Date(a) - new Date(b));
        }
        
        return locations;
        
    } catch (error) {
        console.error(`Failed to load data for ${monthYear}:`, error);
        return []; // Return empty array if no data available
    }
}

// Update globe with current month's data
async function updateGlobe() {
    const monthYear = currentDate.toLocaleDateString('en-US', DATE_FORMAT);
    const locations = await loadMonthData(currentDate);
    
    timeDisplay.textContent = monthYear;
    
    // Update navigation buttons
    prevMonthBtn.disabled = availableMonths.indexOf(monthYear) === 0;
    nextMonthBtn.disabled = availableMonths.indexOf(monthYear) === availableMonths.length - 1;
    
    // Create arcs between locations
    const arcs = [];
    for (let i = 0; i < locations.length - 1; i++) {
        arcs.push({
            startLat: locations[i].lat,
            startLng: locations[i].lng,
            endLat: locations[i+1].lat,
            endLng: locations[i+1].lng,
            color: [
                ['rgba(255, 102, 0, 0.6)', 'rgba(255, 102, 0, 0.3)'],
                ['rgba(255, 102, 0, 0.6)', 'rgba(255, 102, 0, 0.3)']
            ]
        });
    }
    
    // Update globe
    globe
        .pointsData(locations)
        .pointLat(d => d.lat)
        .pointLng(d => d.lng)
        .pointAltitude(0.01)
        .pointRadius(0.25)
        .pointColor(() => 'rgba(255, 102, 0, 0.8)')
        .pointLabel(d => `
            <div style="text-align:center;">
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
    
    // Center view
    if (locations.length > 0) {
        const allLats = locations.map(d => d.lat);
        const allLngs = locations.map(d => d.lng);
        const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
        const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;
        
        globe.controls().autoRotateSpeed = 0.5;
        globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
    }
}

// Navigation controls
prevMonthBtn.addEventListener('click', () => {
    const currentMonthIndex = availableMonths.indexOf(
        currentDate.toLocaleDateString('en-US', DATE_FORMAT)
    );
    if (currentMonthIndex > 0) {
        currentDate = new Date(availableMonths[currentMonthIndex - 1]);
        updateGlobe();
    }
});

nextMonthBtn.addEventListener('click', () => {
    const currentMonthIndex = availableMonths.indexOf(
        currentDate.toLocaleDateString('en-US', DATE_FORMAT)
    );
    if (currentMonthIndex < availableMonths.length - 1) {
        currentDate = new Date(availableMonths[currentMonthIndex + 1]);
        updateGlobe();
    }
});

// Keep your existing handlers exactly as they were:
function handlePointHover(point) {
    /* ... your existing hover handler ... */
}

function handlePointClick(point) {
    /* ... your existing click handler ... */
}

// Initialize
window.addEventListener('resize', () => {
    globe.width(window.innerWidth).height(window.innerHeight);
});

// Start with current month
updateGlobe();