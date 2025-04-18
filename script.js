// Configuration - Updated to use your exact S3 path pattern
const S3_BASE_URL = "https://processedmodiscraped.s3.ap-south-1.amazonaws.com";
const CACHE_BUSTER = `?t=${Date.now()}`;

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

// Add debug console
const debugConsole = document.createElement('div');
debugConsole.style.position = 'absolute';
debugConsole.style.bottom = '10px';
debugConsole.style.left = '10px';
debugConsole.style.color = 'white';
debugConsole.style.backgroundColor = 'rgba(0,0,0,0.5)';
debugConsole.style.padding = '10px';
debugConsole.style.borderRadius = '5px';
debugConsole.style.zIndex = '1000';
debugConsole.style.fontFamily = 'monospace';
debugConsole.style.fontSize = '12px';
debugConsole.style.maxHeight = '100px';
debugConsole.style.overflow = 'auto';
document.body.appendChild(debugConsole);

function logDebug(message) {
    debugConsole.textContent += `\n${new Date().toLocaleTimeString()}: ${message}`;
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

// Main data loader - Updated to use your date-based S3 path
async function loadTravelData() {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        
        const s3Path = `${year}/${month}/${day}/processed.json`;
        const s3Url = `${S3_BASE_URL}/${s3Path}${CACHE_BUSTER}`;
        
        logDebug(`Fetching data from: ${s3Url}`);
        
        const response = await fetch(s3Url);
        logDebug(`Response status: ${response.status}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const rawData = await response.json();
        logDebug(`Received data with ${rawData.locations?.length || 0} locations`);
        
        // Transform data to match your frontend format
        const monthlyData = {};
        
        rawData.locations.forEach(loc => {
            const date = new Date(loc.date || rawData.date);
            const monthYear = date.toLocaleString('default', { 
                month: 'long', 
                year: 'numeric' 
            });
            
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = [];
            }
            
            monthlyData[monthYear].push({
                lat: loc.lat,
                lng: loc.lng,
                name: loc.name,
                date: date.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                }),
                summary: loc.actions?.map(action => `• ${action}`) || []
            });
        });
        
        const result = Object.entries(monthlyData).map(([month, locations]) => ({
            month,
            locations
        }));
        
        logDebug(`Transformed into ${result.length} months of data`);
        return result;
        
    } catch (error) {
        logDebug(`Error: ${error.message}`);
        console.error("Data loading failed:", error);
        return []; // Return empty array instead of fallback data
    }
}

// Initialize with live data
async function initialize() {
    travelData = await loadTravelData();
    isLoading = false;
    
    if (travelData.length > 0) {
        loader.remove();
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
    } else {
        loader.textContent = 'No travel data available for today';
        setTimeout(() => loader.remove(), 3000);
    }
}

// Rest of your existing functions remain exactly the same:
// updateGlobe(), handlePointHover(), handlePointClick(), 
// event listeners, etc. (keep all that code)

// Start the application
initialize();
