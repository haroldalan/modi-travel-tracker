// Configuration
const CONFIG = {
    S3_BASE_URL: "https://processedmodiscraped.s3.ap-south-1.amazonaws.com",
    DATE_FORMAT: { year: 'numeric', month: 'long' },
    LABEL_OPTIONS: { month: 'short', day: 'numeric', year: 'numeric' },
    CACHE_TTL: 30 * 60 * 1000, // 30 minutes cache
    RETRY_DELAY: 1000, // 1 second between retries
    MAX_RETRIES: 3
  };
  
  // DOM refs
  const DOM = {
    globeContainer: document.getElementById('globe-container'),
    tooltip: document.querySelector('.tooltip'),
    infoPanel: document.getElementById('info-panel'),
    timeDisplay: document.getElementById('time-display'),
    prevMonthBtn: document.getElementById('prev-month'),
    nextMonthBtn: document.getElementById('next-month'),
    loadingIndicator: document.getElementById('loading-indicator'),
    noDataMessage: document.querySelector('.no-data-message')
  };
  
  // Date bounds
  const today = new Date();
  const initialDate = new Date(today);
  const earliestDate = new Date(today);
  earliestDate.setFullYear(earliestDate.getFullYear() - 2);
  
  // State
  const state = {
    currentDate: new Date(initialDate),
    travelData: new Map(), // Using Map for better performance
    isFetching: false,
    fetchQueue: []
  };
  
  // Initialize Globe
  function initGlobe() {
    const globe = Globe()
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .showAtmosphere(true)
      .atmosphereColor('rgba(0, 150, 255, 0.2)')
      .width(window.innerWidth)
      .height(window.innerHeight)
      (DOM.globeContainer);
  
    // Configure controls
    const controls = globe.controls();
    controls.enableZoom = true;
    controls.zoomSpeed = 40;
    controls.enablePan = false;
  
    // Default POV: India
    globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 0);
  
    return globe;
  }
  
  const globe = initGlobe();
  
  // Date helpers
  function isBefore(a, b) {
    return a.getFullYear() < b.getFullYear() ||
      (a.getFullYear() === b.getFullYear() && a.getMonth() < b.getMonth());
  }
  
  function isAfter(a, b) {
    return a.getFullYear() > b.getFullYear() ||
      (a.getFullYear() === b.getFullYear() && a.getMonth() > b.getMonth());
  }
  
  function getMonthKey(date) {
    return date.toLocaleDateString('en-US', CONFIG.DATE_FORMAT);
  }
  
  // Data fetching
  async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
        return fetchWithRetry(url, retries - 1);
      }
      throw error;
    }
  }
  
  async function fetchDay(year, month, day) {
    const dd = String(day).padStart(2, '0');
    const url = `${CONFIG.S3_BASE_URL}/${year}/${month}/${dd}/processed.json?t=${Date.now()}`;
    
    try {
      const obj = await fetchWithRetry(url);
      const displayDate = new Date(obj.date).toLocaleDateString('en-US', CONFIG.LABEL_OPTIONS);
  
      if (obj.location) {
        return [{
          lat: obj.location.lat,
          lng: obj.location.lng,
          name: obj.location.name,
          date: displayDate,
          summary: obj.actions || []
        }];
      }
  
      if (Array.isArray(obj.locations)) {
        return obj.locations.map(loc => ({
          lat: loc.lat,
          lng: loc.lng,
          name: loc.name,
          date: displayDate,
          summary: loc.actions || []
        }));
      }
  
      return [];
    } catch (error) {
      console.error(`Failed to fetch data for ${year}-${month}-${dd}:`, error);
      return [];
    }
  }
  
  async function loadMonthData(date) {
    const monthKey = getMonthKey(date);
    const cachedData = state.travelData.get(monthKey);
  
    if (cachedData && (Date.now() - cachedData.timestamp < CONFIG.CACHE_TTL)) {
      return cachedData.data;
    }
  
    DOM.loadingIndicator.style.display = 'block';
    state.isFetching = true;
  
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const daysInMonth = new Date(year, date.getMonth() + 1, 0).getDate();
  
      const perDay = await Promise.all(
        Array.from({ length: daysInMonth }, (_, i) => fetchDay(year, month, i + 1))
      );
  
      const locations = perDay
        .flat()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
  
      state.travelData.set(monthKey, {
        data: locations,
        timestamp: Date.now()
      });
  
      return locations;
    } finally {
      DOM.loadingIndicator.style.display = 'none';
      state.isFetching = false;
      processQueue();
    }
  }
  
  // Queue system for handling rapid month changes
  function processQueue() {
    if (state.isFetching || state.fetchQueue.length === 0) return;
    
    const { date, resolve } = state.fetchQueue.shift();
    loadMonthData(date).then(resolve);
  }
  
  function queueMonthLoad(date) {
    return new Promise(resolve => {
      state.fetchQueue.push({ date, resolve });
      processQueue();
    });
  }
  
  // Globe rendering
  function createArcs(locations) {
    return locations.slice(0, -1).map((a, i) => ({
      startLat: a.lat,
      startLng: a.lng,
      endLat: locations[i + 1].lat,
      endLng: locations[i + 1].lng,
      color: [
        ['rgba(255,102,0,0.6)', 'rgba(255,102,0,0.3)'],
        ['rgba(255,102,0,0.6)', 'rgba(255,102,0,0.3)']
      ]
    }));
  }
  
  function centerGlobeOnLocations(locations) {
    if (locations.length === 0) {
      globe.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2 }, 1000);
      return;
    }
  
    const lats = locations.map(d => d.lat);
    const lngs = locations.map(d => d.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    
    const altitude = locations.length === 1 ? 1.5 : 2;
    globe.pointOfView({ lat: centerLat, lng: centerLng, altitude }, 1000);
  }
  
  async function updateGlobe() {
    const monthYear = getMonthKey(state.currentDate);
    DOM.timeDisplay.textContent = monthYear;
    DOM.prevMonthBtn.disabled = !isAfter(state.currentDate, earliestDate);
    DOM.nextMonthBtn.disabled = !isBefore(state.currentDate, initialDate);
  
    const locations = await queueMonthLoad(state.currentDate);
  
    if (locations.length === 0) {
      DOM.noDataMessage.style.display = 'block';
      globe.pointsData([]).arcsData([]);
      centerGlobeOnLocations([]);
      return;
    }
  
    DOM.noDataMessage.style.display = 'none';
    const arcs = createArcs(locations);
  
    globe
      .pointsData(locations)
      .pointLat(d => d.lat)
      .pointLng(d => d.lng)
      .pointAltitude(0.01)
      .pointRadius(0.7)
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
  
    centerGlobeOnLocations(locations);
  }
  
  // Event handlers
  function handlePointHover(pt) {
    if (!pt) {
      DOM.tooltip.style.display = 'none';
      return;
    }
  
    DOM.tooltip.style.display = 'block';
    const rect = DOM.globeContainer.getBoundingClientRect();
    DOM.tooltip.style.left = `${rect.left + 10}px`;
    DOM.tooltip.style.top = `${rect.top + 10}px`;
  
    DOM.tooltip.innerHTML = `
      <h3>${pt.name}</h3>
      <p><em>${pt.date}</em></p>
      <ul>${pt.summary.map(s => `<li>${s}</li>`).join('')}</ul>
    `;
  }
  
  function handlePointClick(pt) {
    if (!pt) return;
  
    globe.pointOfView({ lat: pt.lat, lng: pt.lng, altitude: 1.5 }, 1000);
  
    DOM.infoPanel.style.display = 'block';
    DOM.infoPanel.innerHTML = `
      <h2>${pt.name}</h2>
      <p><strong>Date:</strong> ${pt.date}</p>
      <h3>Activities:</h3>
      <ul>${pt.summary.map(s => `<li>${s}</li>`).join('')}</ul>
      <button onclick="document.getElementById('info-panel').style.display='none'" aria-label="Close panel">
        Close
      </button>
    `;
  }
  
  function changeMonth(offset) {
    const newDate = new Date(state.currentDate);
    newDate.setMonth(newDate.getMonth() + offset);
    
    if (isAfter(newDate, earliestDate)) {
      state.currentDate = newDate;
      updateGlobe();
    }
  }
  
  // Event listeners
  DOM.prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  DOM.nextMonthBtn.addEventListener('click', () => changeMonth(1));
  
  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowLeft' && !DOM.prevMonthBtn.disabled) {
      changeMonth(-1);
    } else if (e.key === 'ArrowRight' && !DOM.nextMonthBtn.disabled) {
      changeMonth(1);
    } else if (e.key === 'Escape' && DOM.infoPanel.style.display === 'block') {
      DOM.infoPanel.style.display = 'none';
    }
  });
  
  // Responsive handling
  function handleResize() {
    globe.width(window.innerWidth).height(window.innerHeight);
    
    // Reposition tooltip if visible
    if (DOM.tooltip.style.display === 'block') {
      const rect = DOM.globeContainer.getBoundingClientRect();
      DOM.tooltip.style.left = `${rect.left + 10}px`;
      DOM.tooltip.style.top = `${rect.top + 10}px`;
    }
  }
  
  window.addEventListener('resize', debounce(handleResize, 200));
  
  // Debounce helper
  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  // Initial load
  updateGlobe();
