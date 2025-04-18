// Sample data - replace with your actual dataset
const travelData = [
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
            },
            {
                lat: 13.0827,
                lng: 80.2707,
                name: "Chennai, India",
                date: "Jan 10, 2023",
                summary: [
                    "Launched new healthcare initiative",
                    "Attended cultural event",
                    "Met with state government officials"
                ]
            }
        ]
    },
    {
        month: "February 2023",
        locations: [
            {
                lat: 28.6139,
                lng: 77.2090,
                name: "New Delhi, India",
                date: "Feb 2, 2023",
                summary: [
                    "Presented Union Budget",
                    "Held bilateral meetings",
                    "Addressed parliament"
                ]
            },
            {
                lat: 48.8566,
                lng: 2.3522,
                name: "Paris, France",
                date: "Feb 8, 2023",
                summary: [
                    "Attended international summit",
                    "Signed bilateral agreements",
                    "Met with Indian diaspora"
                ]
            },
            {
                lat: 51.5074,
                lng: -0.1278,
                name: "London, UK",
                date: "Feb 12, 2023",
                summary: [
                    "Met with UK Prime Minister",
                    "Addressed business forum",
                    "Visited cultural sites"
                ]
            },
            {
                lat: 28.6139,
                lng: 77.2090,
                name: "New Delhi, India",
                date: "Feb 18, 2023",
                summary: [
                    "Chaired security meeting",
                    "Launched digital initiative",
                    "Met with state chief ministers"
                ]
            }
        ]
    },
    // Add more months as needed
];

// Initialize globe
const globeContainer = document.getElementById('globe-container');
const tooltip = document.querySelector('.tooltip');
const timeDisplay = document.getElementById('time-display');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');

let currentMonthIndex = 0;

const globe = Globe()
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('rgba(0, 150, 255, 0.2)')
    .width(window.innerWidth)
    .height(window.innerHeight)
    (globeContainer);

// Handle window resize
window.addEventListener('resize', () => {
    globe.width(window.innerWidth).height(window.innerHeight);
});

// Function to update globe with current month's data
function updateGlobe() {
    const currentData = travelData[currentMonthIndex];
    timeDisplay.textContent = currentData.month;
    
    // Disable/enable navigation buttons
    prevMonthBtn.disabled = currentMonthIndex === 0;
    nextMonthBtn.disabled = currentMonthIndex === travelData.length - 1;
    
    // Extract locations and create arcs
    const locations = currentData.locations;
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
    
    // Update globe with new data
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
    
    // Auto-rotate to show all points
    const allLats = locations.map(d => d.lat);
    const allLngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...allLats) + Math.max(...allLats)) / 2;
    const centerLng = (Math.min(...allLngs) + Math.max(...allLngs)) / 2;
    
    // Smooth transition to new view
    // globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 0.5;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude: 2 }, 1000);
}

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
    // Center on clicked point
    globe.pointOfView({ lat: point.lat, lng: point.lng, altitude: 1.5 }, 1000);
    
    // Show detailed info panel
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

// Initialize
updateGlobe();

// Close info panel when clicking outside
document.addEventListener('click', (e) => {
    const infoPanel = document.getElementById('info-panel');
    if (infoPanel.style.display === 'block' && 
        !infoPanel.contains(e.target) && 
        !e.target.classList.contains('point')) {
        infoPanel.style.display = 'none';
    }
});