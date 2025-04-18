// Configuration
const S3_BUCKET_URL = "https://processedmodiscraped.s3.amazonaws.com/latest.json";
const FALLBACK_DATA = [
    {
        month: "January 2023",
        locations: [
            {
                lat: 28.6139,
                lng: 77.2090,
                name: "New Delhi, India",
                date: "Jan 1, 2023",
                summary: [
                    "Attended Republic Day parade",
                    "Met with foreign dignitaries",
                    "Chaired cabinet meeting"
                ]
            },
            {
                lat: 19.0760,
                lng: 72.8777,
                name: "Mumbai, India",
                date: "Jan 5, 2023",
                summary: [
                    "Inaugurated new infrastructure projects",
                    "Met with business leaders",
                    "Addressed public rally"
                ]
            }
        ]
    }
];

// DOM Elements
const globeContainer = document.getElementById('globe-container');
const tooltip = document.querySelector('.tooltip');
const timeDisplay = document.getElementById('time-display');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

// State
let currentMonthIndex = 0;
let travelData = [];
let isLoading = true;

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

// Add loading indicator
const loader = document.createElement('div');
loader.style.position = 'absolute';
loader.style.top = '50%';
loader.style.left = '50%';
loader.style.transform = 'translate(-50%, -50%)';
loader.style.color = 'white';
loader.style.backgroundColor = 'rgba(0,0,0,0.7)';
loader.style.padding = '20px';
loader.style.borderRadius = '5px';
loader.style.zIndex = '100';
loader.textContent = 'Loading travel data...';
document.body.appendChild(loader);

// Main data loader
async function loadTravelData() {
    try {
        const response = await fetch(`${S3_BUCKET_URL}?t=${Date.now()}`); // Cache busting
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const rawData = await response.json();
        
        // Group by month and transform to frontend format
        const monthlyData = {};
        rawData.locations.forEach(loc => {
            const date = new Date(loc.date || rawData.date);
            const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = [];
            }
            
            monthlyData[monthYear].push({
                lat: loc.lat,
                lng: loc.lng,
                name: loc.name,
                date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                summary: loc.actions.map(action => `• ${action}`)
            });
        });
        
        return Object.entries(monthlyData).map(([month, locations]) => ({
            month,
            locations
        }));
        
    } catch (error) {
        console.error("Using fallback data:", error);
        return FALLBACK_DATA;
    }
}

// Initialize with live data
async function initialize() {
    travelData = await loadTravelData();
    isLoading = false;
    loader.remove();
    
    if (travelData.length > 0) {
        updateGlobe();
        
        // Auto-refresh every 5 minutes
        setInterval(async () => {
            const newData = await loadTravelData();
            if (JSON.stringify(newData) !== JSON.stringify(travelData)) {
                travelData = newData;
                currentMonthIndex = Math.min(currentMonthIndex, travelData.length - 1);
                updateGlobe();
            }
        }, 300000);
    }
}

// Update globe with current month's data
function updateGlobe() {
    if (isLoading || travelData.length === 0) return;
    
    const currentData = travelData[currentMonthIndex];
    timeDisplay.textContent = currentData.month;
    
    // Update navigation buttons
    prevMonthBtn.disabled = currentMonthIndex === 0;
    nextMonthBtn.disabled = currentMonthIndex === travelData.length - 1;
    
    // Create arcs between locations
    const arcs = [];
    const locations = currentData.locations;
    
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
    const allLats = locations.map(d => d.lat);
    const allLngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
    const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;
    
    globe.controls().autoRotateSpeed = 0.5;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
}

// Event handlers (unchanged from your original)
function handlePointHover(point) {
    if (point) {
        tooltip.style.display = 'block';
        tooltip.style.left = `${globeContainer.getBoundingClientRect().left + window.scrollX + 10}px`;
        tooltip.style.top = `${globeContainer.getBoundingClientRect().top + window.scrollY + 10}px`;
        
        tooltip.innerHTML = `
            <h3>${point.name}</h3>
            <p><em>${point.date}</em></p>
            <ul>
                ${point.summary.map(item => `<li>${item}</li>`).join('')}
            </ul>
        `;
    } else {
        tooltip.style.display = 'none';
    }
}

function handlePointClick(point) {
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.5 }, 1000);
    
    const infoPanel = document.getElementById('info-panel');
    infoPanel.style.display = 'block';
    infoPanel.innerHTML = `
        <h2>${point.name}</h2>
        <p><strong>Date:</strong> ${point.date}</p>
        <h3>Activities:</h3>
        <ul>
            ${point.summary.map(item => `<li>${item}</li>`).join('')}
        </ul>
        <button onclick="document.getElementById('info-panel').style.display='none'">Close</button>
    `;
}

// Navigation controls
prevMonthBtn.addEventListener('click', () => {
    if (currentMonthIndex > 0) {
        currentMonthIndex--;
        updateGlobe();
    }
});

nextMonthBtn.addEventListener('click', () => {
    if (currentMonthIndex < travelData.length - 1) {
        currentMonthIndex++;
        updateGlobe();
    }
});

// Window resize handler
window.addEventListener('resize', () => {
    globe.width(window.innerWidth).height(window.innerHeight);
});

// Close info panel when clicking outside
document.addEventListener('click', (e) => {
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel.style.display === 'block' && 
        !infoPanel.contains(e.target) && 
        !e.target.classList.contains('point')) {
        infoPanel.style.display = 'none';
    }
});

// Start the application
initialize();
