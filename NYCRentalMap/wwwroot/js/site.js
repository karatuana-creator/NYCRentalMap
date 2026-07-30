/* ==========================================================================
   NYC RENTAL MAP — MAIN DASHBOARD APPLICATION SCRIPT
   Full Interactive Features: Filter, Charts, Leaflet Map, Favorites, Modals
   ========================================================================== */

const appUI = (function () {
    'use strict';

    // ── Application State ──
    let map = null;
    let markersGroup = null;
    let currentTileIndex = 0;
    
    // Available Map Tile Layers
    const mapTiles = [
        { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap' },
        { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; CARTO Voyager' },
        { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; CARTO Dark' }
    ];

    // Favorites Array & Persistence
    let favoriteIds = new Set(); // Stores user favourited property IDs
    let favoriteItemsMap = {};   // Stores property details for offline/page-refresh persistence
    let currentListingsData = [];
    let activeProperty = null;

    function loadFavoritesFromStorage() {
        try {
            const storedIds = localStorage.getItem('nyc_rental_favorite_ids');
            const storedItems = localStorage.getItem('nyc_rental_favorite_items');
            if (storedIds) {
                const parsedIds = JSON.parse(storedIds);
                if (Array.isArray(parsedIds)) {
                    favoriteIds = new Set(parsedIds.map(Number));
                }
            }
            if (storedItems) {
                favoriteItemsMap = JSON.parse(storedItems) || {};
            }
        } catch (e) {
            console.error('Favorites loading error:', e);
        }
    }

    function saveFavoritesToStorage() {
        try {
            localStorage.setItem('nyc_rental_favorite_ids', JSON.stringify(Array.from(favoriteIds)));
            localStorage.setItem('nyc_rental_favorite_items', JSON.stringify(favoriteItemsMap));
        } catch (e) {
            console.error('Favorites saving error:', e);
        }
    }

    function syncFavoriteUI() {
        const count = favoriteIds.size;
        
        // 1. Update all count badges across the layout
        const navBadge = document.getElementById('navFavBadge');
        if (navBadge) navBadge.textContent = count;

        const drawerCount = document.getElementById('favCountTxt');
        if (drawerCount) drawerCount.textContent = count;

        const pageTotal = document.getElementById('favPageTotalCount');
        if (pageTotal) pageTotal.textContent = count + ' Ev';

        const profileCount = document.getElementById('profileFavCount');
        if (profileCount) profileCount.textContent = count;

        // 2. Update all heart buttons on listing cards in DOM
        document.querySelectorAll('.fav-btn, .btn-fav').forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick') || '';
            const match = onclickAttr.match(/toggleFavorite\s*\(\s*(\d+)/);
            if (match && match[1]) {
                const id = Number(match[1]);
                const isFav = favoriteIds.has(id);
                if (isFav) {
                    btn.classList.add('active');
                    const icon = btn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-heart';
                } else {
                    btn.classList.remove('active');
                    const icon = btn.querySelector('i');
                    if (icon) icon.className = 'fa-regular fa-heart';
                }
            }
        });
    }

    function toggleFavorite(id, btnElement) {
        const numId = Number(id);
        if (favoriteIds.has(numId)) {
            favoriteIds.delete(numId);
            delete favoriteItemsMap[numId];
        } else {
            favoriteIds.add(numId);
            const foundItem = currentListingsData.find(x => Number(x.id) === numId) || 
                              (activeProperty && Number(activeProperty.id) === numId ? activeProperty : null);
            if (foundItem) {
                favoriteItemsMap[numId] = foundItem;
            }
        }
        saveFavoritesToStorage();
        syncFavoriteUI();
        renderFavoritesDrawer();
        renderFavoritesPage();
        renderComparePage();
    }

    function renderFavoritesPage() {
        const grid = document.getElementById('favoritesPageGrid');
        const emptyState = document.getElementById('favEmptyState');
        const totalCountEl = document.getElementById('favPageTotalCount');
        const avgPriceEl = document.getElementById('favPageAvgPrice');
        const totalPriceEl = document.getElementById('favPageTotalPrice');

        if (!grid) return;

        if (favoriteIds.size === 0) {
            grid.style.display = 'none';
            if (emptyState) emptyState.style.display = 'block';
            if (totalCountEl) totalCountEl.textContent = '0 Ev';
            if (avgPriceEl) avgPriceEl.textContent = '$0';
            if (totalPriceEl) totalPriceEl.textContent = '$0';
            return;
        }

        grid.style.display = 'grid';
        if (emptyState) emptyState.style.display = 'none';

        let totalPriceSum = 0;
        let html = '';

        favoriteIds.forEach(id => {
            const p = currentListingsData.find(x => Number(x.id) === Number(id)) || favoriteItemsMap[id] || {
                id: id,
                name: 'Harika Konumda Ev #' + id,
                price: 120,
                borough: 'Manhattan',
                neighbourhood: 'New York',
                rating: 4.85,
                reviews: 45,
                beds: 2,
                guests: 4,
                imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80'
            };

            const price = p.price || 120;
            totalPriceSum += price;

            html += `
                <div class="property-card" onclick="appUI.selectPropertyById(${p.id})">
                    <div class="card-img-wrapper">
                        <img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" class="card-img" />
                        <span class="badge-room-type">${escapeHtml(p.roomType || 'Tüm Ev')}</span>
                        <button type="button" class="btn-fav active" onclick="event.stopPropagation(); appUI.toggleFavorite(${p.id}, this)">
                            <i class="fa-solid fa-heart"></i>
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="card-location">📍 ${escapeHtml(p.neighbourhood || 'New York')}, ${escapeHtml(p.borough || 'Manhattan')}</div>
                        <h4 class="card-title">${escapeHtml(p.name)}</h4>
                        <div class="card-specs">
                            <span><i class="fa-solid fa-bed"></i> ${p.beds || 2} yatak</span>
                            <span><i class="fa-solid fa-user-group"></i> ${p.guests || 4} misafir</span>
                        </div>
                        <div class="card-footer">
                            <div class="card-rating">
                                <i class="fa-solid fa-star icon-star"></i>
                                <strong>${p.rating || 4.8}</strong>
                                <span class="reviews-count">(${p.reviews || 25})</span>
                            </div>
                            <div class="card-price-box">
                                <strong class="price-val">$${price}</strong>
                                <small class="price-unit">/ gece</small>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;

        const count = favoriteIds.size;
        const avgPrice = Math.round(totalPriceSum / count);
        const total3Nights = totalPriceSum * 3;

        if (totalCountEl) totalCountEl.textContent = count + ' Ev';
        if (avgPriceEl) avgPriceEl.textContent = '$' + avgPrice;
        if (totalPriceEl) totalPriceEl.textContent = '$' + total3Nights.toLocaleString('tr-TR');
    }

    function renderComparePage() {
        const wrapper = document.getElementById('compareTableWrapper');
        if (!wrapper) return;

        let compareProps = [];
        if (favoriteIds.size > 0) {
            favoriteIds.forEach(id => {
                const item = currentListingsData.find(x => Number(x.id) === Number(id));
                if (item) compareProps.push(item);
            });
        }

        // If user has no favorites yet, pick top 3 listings to present a rich comparison table
        if (compareProps.length < 2 && currentListingsData.length >= 2) {
            compareProps = currentListingsData.slice(0, 3);
        }

        if (compareProps.length === 0) {
            wrapper.innerHTML = `
                <div style="text-align:center; padding:3rem; background:#f8fafc; border-radius:16px;">
                    <i class="fa-solid fa-code-compare" style="font-size:3rem; color:#94a3b8; margin-bottom:1rem;"></i>
                    <h4 style="font-size:1.1rem; font-weight:700; color:#1e293b;">Karşılaştırılacak Ev Bulunamadı</h4>
                    <p style="color:#64748b; font-size:0.88rem;">Lütfen ana sayfadan ev seçin veya favorilerinize ekleyin.</p>
                </div>
            `;
            return;
        }

        let html = `
            <table style="width:100%; border-collapse:separate; border-spacing:1rem 0; min-width:750px;">
                <thead>
                    <tr>
                        <th style="width:180px; padding:1rem; text-align:left; background:#f8fafc; border-radius:12px; font-size:0.9rem; color:#64748b;">Özellikler</th>
        `;

        compareProps.forEach(p => {
            html += `
                <th style="padding:1rem; background:#f8fafc; border-radius:16px 16px 0 0; text-align:center; vertical-align:top; width:260px;">
                    <img src="${p.imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=400&q=80'}" style="width:100%; height:130px; object-fit:cover; border-radius:12px; margin-bottom:0.75rem;" />
                    <h4 style="font-size:0.95rem; font-weight:800; color:#0f172a; margin:0 0 0.25rem 0; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(p.name)}</h4>
                    <span style="font-size:0.75rem; color:#64748b;">📍 ${escapeHtml(p.neighbourhood || 'New York')}, ${escapeHtml(p.borough || 'Manhattan')}</span>
                </th>
            `;
        });

        html += `
                    </tr>
                </thead>
                <tbody>
                    <!-- Row 1: Price -->
                    <tr>
                        <td style="padding:1rem; font-weight:700; color:#334155; border-bottom:1px solid #e2e8f0;"><i class="fa-solid fa-tag" style="color:#e11d48; margin-right:6px;"></i> Gecelik Fiyat</td>
        `;
        compareProps.forEach(p => {
            html += `<td style="padding:1rem; text-align:center; font-weight:800; font-size:1.1rem; color:#e11d48; border-bottom:1px solid #e2e8f0; background:#fff;">$${p.price || 120} <small style="font-weight:400; color:#64748b; font-size:0.75rem;">/gece</small></td>`;
        });

        html += `
                    </tr>
                    <!-- Row 2: Room Type -->
                    <tr>
                        <td style="padding:1rem; font-weight:700; color:#334155; border-bottom:1px solid #e2e8f0;"><i class="fa-solid fa-house" style="color:#6366f1; margin-right:6px;"></i> Oda Tipi</td>
        `;
        compareProps.forEach(p => {
            html += `<td style="padding:1rem; text-align:center; font-weight:700; font-size:0.88rem; color:#1e293b; border-bottom:1px solid #e2e8f0; background:#fff;">${escapeHtml(p.roomType || 'Tüm Ev')}</td>`;
        });

        html += `
                    </tr>
                    <!-- Row 3: Rating -->
                    <tr>
                        <td style="padding:1rem; font-weight:700; color:#334155; border-bottom:1px solid #e2e8f0;"><i class="fa-solid fa-star" style="color:#f59e0b; margin-right:6px;"></i> Müşteri Puanı</td>
        `;
        compareProps.forEach(p => {
            html += `<td style="padding:1rem; text-align:center; font-weight:700; font-size:0.88rem; color:#1e293b; border-bottom:1px solid #e2e8f0; background:#fff;"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> ${p.rating || 4.85} <small style="color:#64748b;">(${p.reviews || 45} yorum)</small></td>`;
        });

        html += `
                    </tr>
                    <!-- Row 4: Minimum Nights -->
                    <tr>
                        <td style="padding:1rem; font-weight:700; color:#334155; border-bottom:1px solid #e2e8f0;"><i class="fa-solid fa-moon" style="color:#38bdf8; margin-right:6px;"></i> Min. Konaklama</td>
        `;
        compareProps.forEach(p => {
            html += `<td style="padding:1rem; text-align:center; font-weight:700; font-size:0.88rem; color:#1e293b; border-bottom:1px solid #e2e8f0; background:#fff;">${p.minNights || 1} Gece</td>`;
        });

        html += `
                    </tr>
                    <!-- Row 5: Action Button -->
                    <tr>
                        <td style="padding:1rem;"></td>
        `;
        compareProps.forEach(p => {
            html += `
                <td style="padding:1.25rem 1rem; text-align:center; background:#f8fafc; border-radius:0 0 16px 16px;">
                    <button type="button" class="btn-primary-coral" onclick="appUI.selectPropertyById(${p.id})" style="width:100%; padding:0.65rem; font-weight:700; border-radius:10px; font-size:0.85rem;">
                        İncele & Rezerve Et
                    </button>
                </td>
            `;
        });

        html += `
                    </tr>
                </tbody>
            </table>
        `;

        wrapper.innerHTML = html;
    }

    function clearAllFavorites() {
        favoriteIds.clear();
        favoriteItemsMap = {};
        saveFavoritesToStorage();
        syncFavoriteUI();
        renderFavoritesDrawer();
        renderFavoritesPage();
        renderComparePage();
    }

    function renderFavoritesDrawer() {
        const countBadgeNav = document.getElementById('navFavBadge');
        const countTxtDrawer = document.getElementById('favCountTxt');
        const favContainer = document.getElementById('favCardsContainer');

        if (countBadgeNav) countBadgeNav.textContent = favoriteIds.size;
        if (countTxtDrawer) countTxtDrawer.textContent = favoriteIds.size;

        if (!favContainer) return;

        if (favoriteIds.size === 0) {
            favContainer.innerHTML = '<span style="font-size:0.8rem; color:#9ca3af; padding: 0.5rem 0;">Henüz favorilere ev eklemediniz. Ev kartlarındaki kalbe basarak ekleyebilirsiniz.</span>';
            return;
        }

        let html = '';
        favoriteIds.forEach(id => {
            const p = currentListingsData.find(x => Number(x.id) === Number(id)) || favoriteItemsMap[id] || {
                id: id,
                name: 'Favori Ev #' + id,
                price: 120,
                borough: 'Manhattan',
                neighbourhood: 'New York'
            };

            html += `
                <div class="fav-mini-card" onclick="appUI.selectPropertyById(${p.id})">
                    <div class="fav-mini-info">
                        <strong>$${p.price} / gece</strong>
                        <span>${escapeHtml(p.borough || 'New York')}</span>
                        <p style="font-size:0.7rem; color:#d1d5db; margin:0; text-overflow:ellipsis; overflow:hidden; whitespace:nowrap;">${escapeHtml(p.name)}</p>
                    </div>
                </div>
            `;
        });
        favContainer.innerHTML = html;
        renderFavoritesPage();
    }

    // Chart.js Instances
    let donutChartInst = null;
    let boroughChartInst = null;
    let priceHistChartInst = null;
    let monthlyLineChartInst = null;
    let ratingBarChartInst = null;

    // ── Document Ready Handler ──
    document.addEventListener("DOMContentLoaded", function () {
        loadFavoritesFromStorage();
        syncFavoriteUI();
        initMap();
        initCharts();
        bindEvents();
        fetchData();
        renderFavoritesPage();
        renderComparePage();
        initScrollSpy();
        // Load all DB property pins on map (independent of filters)
        setTimeout(loadAllMapMarkers, 500);
    });

    // Fallback load safety for Chart.js initialization
    window.addEventListener("load", function() {
        if (!donutChartInst) {
            initCharts();
        }
    });

    // ─────────────────────────────────────
    //  1. MAP INITIALIZATION & MARKERS
    // ─────────────────────────────────────

    function initMap() {
        const mapEl = document.getElementById("map");
        if (!mapEl) return;

        map = L.map("map").setView([40.7128, -74.0060], 11);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "&copy; OpenStreetMap"
            }
        ).addTo(map);

        markersGroup = L.layerGroup().addTo(map);
    }

    // Google Maps Style Red Pin SVG Icon for Leaflet Map
    const googleMapPinIcon = L.divIcon({
        className: 'custom-google-map-pin',
        html: `
            <div style="position:relative; width:28px; height:36px; cursor:pointer;">
                <svg width="28" height="36" viewBox="0 0 384 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.35));">
                    <path fill="#ea4335" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
                    <circle cx="192" cy="192" r="70" fill="#ffffff"/>
                    <path fill="#ea4335" d="M192 142c-27.614 0-50 22.386-50 50s22.386 50 50 50 50-22.386 50-50-22.386-50-50-50z"/>
                </svg>
            </div>
        `,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -34]
    });

    function toggleMapTileLayer() {
        if (!map) return;
        currentTileIndex = (currentTileIndex + 1) % mapTiles.length;
        
        map.eachLayer(function (layer) {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        L.tileLayer(mapTiles[currentTileIndex].url, { maxZoom: 19 }).addTo(map);
    }

    let markerMap = new Map();

    // All-markers layer group (separate from filtered markersGroup)
    let allMarkersGroup = null;
    let allMarkersLoaded = false;

    // Red Google Maps style SVG pin divIcon factory
    function makeRedPinIcon() {
        return L.divIcon({
            className: 'custom-red-pin-wrap',
            html: `<div style="position:relative;width:24px;height:32px;cursor:pointer;"><svg width="24" height="32" viewBox="0 0 384 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.35));"><path fill="#ea4335" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/><circle cx="192" cy="192" r="64" fill="#fff"/></svg></div>`,
            iconSize: [24, 32],
            iconAnchor: [12, 32],
            popupAnchor: [0, -32]
        });
    }

    var allMarkersRawData = [];

    function loadAllMapMarkers() {
        if (allMarkersLoaded || !map) return;

        // MarkerCluster Group — 48K pini performanslı gösterir
        if (typeof L.markerClusterGroup === 'function') {
            allMarkersGroup = L.markerClusterGroup({
                chunkedLoading: true,
                chunkInterval: 200,
                chunkDelay: 50,
                maxClusterRadius: 60,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false,
                zoomToBoundsOnClick: true,
                iconCreateFunction: function (cluster) {
                    const count = cluster.getChildCount();
                    let size = 'small', sz = 34;
                    if (count >= 100) { size = 'medium'; sz = 42; }
                    if (count >= 1000) { size = 'large'; sz = 52; }
                    return L.divIcon({
                        html: `<div style="background:linear-gradient(135deg,#ea4335,#c0392b);color:#fff;width:${sz}px;height:${sz}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${sz > 40 ? '0.85' : '0.75'}rem;box-shadow:0 3px 10px rgba(234,67,53,0.5);border:3px solid #fff;">${count > 999 ? Math.round(count/1000)+'K' : count}</div>`,
                        className: 'red-cluster-icon',
                        iconSize: L.point(sz, sz)
                    });
                }
            });
        } else {
            allMarkersGroup = L.layerGroup();
        }

        fetch('/Home/GetAllMapMarkers')
            .then(res => res.json())
            .then(data => {
                if (!data || data.length === 0) return;
                allMarkersRawData = data;
                const markers = [];
                data.forEach(item => {
                    let lat = Number(item.latitude ?? item.Latitude ?? 0);
                    let lng = Number(item.longitude ?? item.Longitude ?? 0);
                    if (Math.abs(lat) > 90) lat = lat / 100000.0;
                    if (Math.abs(lng) > 180) lng = lng / 100000.0;

                    const itemId = item.id ?? item.Id;
                    const name = item.name ?? item.Name ?? 'Kiralık Ev';
                    const price = item.price ?? item.Price ?? '–';
                    const borough = item.borough ?? item.Borough ?? '';
                    const neighbourhood = item.neighbourhood ?? item.Neighbourhood ?? '';
                    const roomType = item.roomType ?? item.RoomType ?? 'Tüm Ev';

                    if (!lat || !lng) return;

                    const marker = L.marker([lat, lng], { icon: makeRedPinIcon() });

                    marker.bindPopup(`
                        <div style="font-family:Inter,sans-serif;padding:8px 10px;max-width:220px;">
                            <div style="font-size:0.7rem;font-weight:600;color:#ea4335;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${escapeHtml(borough)}${neighbourhood ? ' · ' + escapeHtml(neighbourhood) : ''}</div>
                            <strong style="font-size:0.85rem;color:#0f172a;display:block;margin-bottom:6px;line-height:1.35;">${escapeHtml(name)}</strong>
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                                <span style="color:#ea4335;font-weight:800;font-size:1rem;">$${price}<small style="font-weight:400;color:#64748b;font-size:0.75rem;"> / gece</small></span>
                                <span style="background:#f1f5f9;color:#475569;font-size:0.7rem;font-weight:600;padding:2px 7px;border-radius:99px;">${escapeHtml(roomType)}</span>
                            </div>
                            <button onclick="appUI.selectPropertyById(${itemId})" style="background:linear-gradient(135deg,#ea4335,#c0392b);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;width:100%;letter-spacing:0.3px;">🏠 Detayları İncele</button>
                        </div>
                    `, { maxWidth: 240 });

                    markers.push(marker);
                    if (itemId) markerMap.set(Number(itemId), marker);
                });

                if (allMarkersGroup.addLayers) {
                    allMarkersGroup.addLayers(markers);
                } else {
                    markers.forEach(m => m.addTo(allMarkersGroup));
                }
                map.addLayer(allMarkersGroup);
                allMarkersLoaded = true;
                console.log(`✅ Haritaya ${markers.length} ev pini yüklendi.`);
            })
            .catch(err => console.error('Map markers load error:', err));
    }

    function updateMapMarkers(markersData) {
        if (!map || !markersGroup) return;
        markersGroup.clearLayers();
        if (!markersData || markersData.length === 0) return;

        markersData.forEach(item => {
            let lat = Number(item.latitude ?? item.Latitude ?? 0);
            let lng = Number(item.longitude ?? item.Longitude ?? 0);
            if (Math.abs(lat) > 90) lat = lat / 100000.0;
            if (Math.abs(lng) > 180) lng = lng / 100000.0;

            const itemId = item.id ?? item.Id;
            const name = item.name ?? item.Name ?? 'Kiralık Ev';
            const price = item.price ?? item.Price ?? '–';
            const borough = item.borough ?? item.Borough ?? '';
            const neighbourhood = item.neighbourhood ?? item.Neighbourhood ?? '';
            const roomType = item.roomType ?? item.RoomType ?? 'Tüm Ev';

            if (!lat || !lng) return;

            const marker = L.marker([lat, lng], { icon: makeRedPinIcon() });
            marker.bindPopup(`
                <div style="font-family:Inter,sans-serif;padding:8px 10px;max-width:220px;">
                    <div style="font-size:0.7rem;font-weight:600;color:#ea4335;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">${escapeHtml(borough)}${neighbourhood ? ' · ' + escapeHtml(neighbourhood) : ''}</div>
                    <strong style="font-size:0.85rem;color:#0f172a;display:block;margin-bottom:6px;line-height:1.35;">${escapeHtml(name)}</strong>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <span style="color:#ea4335;font-weight:800;font-size:1rem;">$${price}<small style="font-weight:400;color:#64748b;font-size:0.75rem;"> / gece</small></span>
                        <span style="background:#f1f5f9;color:#475569;font-size:0.7rem;font-weight:600;padding:2px 7px;border-radius:99px;">${escapeHtml(roomType)}</span>
                    </div>
                    <button onclick="appUI.selectPropertyById(${itemId})" style="background:linear-gradient(135deg,#ea4335,#c0392b);color:#fff;border:none;padding:7px 14px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;width:100%;letter-spacing:0.3px;">🏠 Detayları İncele</button>
                </div>
            `, { maxWidth: 240 });

            markersGroup.addLayer(marker);
            if (itemId) markerMap.set(Number(itemId), marker);
        });
    }

    // ─────────────────────────────────────
    //  2. CHARTS (CHART.JS) INITIALIZATION
    // ─────────────────────────────────────

    function initCharts() {
        // A. Donut Chart (Oda Tipine Göre Dağılım - Yuvarlak Grafik)
        const donutCtx = document.getElementById('roomTypeDonutChart')?.getContext('2d');
        if (donutCtx) {
            donutChartInst = new Chart(donutCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Entire Home', 'Private Room', 'Shared Room'],
                    datasets: [{
                        data: [25604, 21054, 2237],
                        backgroundColor: ['#C69B7B', '#E6CCB2', '#FAEDCD'],
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 6
                    }]
                },
                options: {
                    cutout: '68%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const val = context.raw || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = Math.round((val / total) * 100);
                                    return ` ${context.label}: %${pct} (${val.toLocaleString('tr-TR')} ev)`;
                                }
                            }
                        }
                    },
                    animation: { animateScale: true, animateRotate: true },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // B. Horizontal Bar Chart (Mahallelere Göre Ortalama Fiyat)
        const boroughCtx = document.getElementById('boroughBarChart')?.getContext('2d');
        if (boroughCtx) {
            boroughChartInst = new Chart(boroughCtx, {
                type: 'bar',
                data: {
                    labels: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
                    datasets: [{
                        label: 'Ortalama Fiyat',
                        data: [196, 124, 99, 78, 73],
                        backgroundColor: ['#C69B7B', '#D4A373', '#E6CCB2', '#EDE0D4', '#FAEDCD'],
                        borderRadius: 6,
                        barThickness: 12
                    }]
                },
                options: {
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    return ` Gecelik Ort. Fiyat: $${context.raw}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(0,0,0,0.04)' },
                            ticks: {
                                callback: function (val) { return '$' + val; },
                                font: { size: 10, family: 'Inter' }
                            }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { font: { size: 10, weight: '600', family: 'Inter' } }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // C. Price Histogram
        const priceHistCtx = document.getElementById('priceHistChart')?.getContext('2d');
        if (priceHistCtx) {
            priceHistChartInst = new Chart(priceHistCtx, {
                type: 'bar',
                data: {
                    labels: ['$0', '$50', '$100', '$150', '$200', '$250', '$300', '$500+'],
                    datasets: [{
                        data: [12, 45, 89, 120, 75, 40, 25, 10],
                        backgroundColor: '#3b82f6',
                        borderRadius: 3
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 9 } } }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // D. Monthly Price Line Chart
        const lineCtx = document.getElementById('monthlyLineChart')?.getContext('2d');
        if (lineCtx) {
            monthlyLineChartInst = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'],
                    datasets: [{
                        data: [110, 115, 125, 140, 155, 170, 185, 180, 160, 145, 130, 150],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 2
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 8 } } }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // E. Rating Bar Chart (Yorum Puanı Dağılımı)
        const ratingCtx = document.getElementById('ratingBarChart')?.getContext('2d');
        if (ratingCtx) {
            window.ratingBarChartInst = new Chart(ratingCtx, {
                type: 'bar',
                data: {
                    labels: ['5★ (Mükemmel)', '4★ (Çok İyi)', '3★ (İyi)', '2★ (Orta)', '1★ (Düşük)'],
                    datasets: [{
                        data: [68, 22, 7, 2, 1],
                        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'],
                        borderRadius: 4
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                        y: { grid: { display: false }, ticks: { font: { size: 8 }, callback: v => '%' + v } }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // F. Statistics Page Full Bar Chart (statBoroughChart)
        const statBoroughCtx = document.getElementById('statBoroughChart')?.getContext('2d');
        if (statBoroughCtx) {
            window.statBoroughChartInst = new Chart(statBoroughCtx, {
                type: 'bar',
                data: {
                    labels: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
                    datasets: [{
                        label: 'Gecelik Ortalama Fiyat ($)',
                        data: [196, 124, 99, 78, 73],
                        backgroundColor: ['#C69B7B', '#D4A373', '#E6CCB2', '#EDE0D4', '#FAEDCD'],
                        borderRadius: 8
                    }]
                },
                options: {
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 11, weight: '700' }, color: '#64748b' } },
                        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => '$' + v, font: { size: 11 }, color: '#64748b' } }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // G. Statistics Page Full Pie Chart (statRoomTypeChart)
        const statRoomCtx = document.getElementById('statRoomTypeChart')?.getContext('2d');
        if (statRoomCtx) {
            window.statRoomTypeChartInst = new Chart(statRoomCtx, {
                type: 'pie',
                data: {
                    labels: ['Entire Home / Apt', 'Private Room', 'Shared Room'],
                    datasets: [{
                        data: [25604, 21054, 2237],
                        backgroundColor: ['#C69B7B', '#E6CCB2', '#FAEDCD'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    plugins: { legend: { position: 'bottom', labels: { font: { size: 11, weight: '600' }, color: '#64748b', usePointStyle: true } } },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    // ─────────────────────────────────────
    //  3. EVENT BINDINGS
    // ─────────────────────────────────────

    function bindEvents() {
        // Top search bar sync & Live Search
        const topSearch = document.getElementById('topSearchInput');
        const keywordInput = document.getElementById('keywordInput');
        const selSortBy = document.getElementById('selSortBy');

        if (selSortBy) {
            selSortBy.addEventListener('change', function () {
                fetchData(1, false);
            });
        }

        if (topSearch) {
            topSearch.addEventListener('input', function () {
                if (keywordInput) keywordInput.value = topSearch.value;
                fetchData();
            });
        }

        if (keywordInput) {
            keywordInput.addEventListener('input', function () {
                if (topSearch) topSearch.value = keywordInput.value;
                fetchData();
            });
        }
    }

    // ─────────────────────────────────────
    //  4. DATA FETCHING (AJAX API)
    // ─────────────────────────────────────

    function fetchData(page = 1, isManualSubmit = false) {
        const keyVal = document.getElementById('keywordInput')?.value?.trim();
        const topVal = document.getElementById('topSearchInput')?.value?.trim();
        const search = keyVal || topVal || '';
        const priceInput = document.getElementById('priceRangeInput');
        const maxPrice = (priceInput && Number(priceInput.value) >= Number(priceInput.max)) ? '' : priceInput?.value;
        const borough = document.getElementById('selBorough')?.value;
        const minNights = document.getElementById('selMinNights')?.value;
        const minReviews = document.getElementById('reviewsRangeInput')?.value;
        
        const sortSelect = document.getElementById("selSortBy");
        const sortBy = sortSelect ? sortSelect.value : "";
        console.log("Sort Select:", sortSelect);
        console.log("Sort Value:", sortBy);

        // Selected Room Types
        const selectedRooms = [];
        document.querySelectorAll('.chk-room:checked').forEach(chk => selectedRooms.push(chk.value));
        const roomTypesStr = selectedRooms.join(',');

        const params = new URLSearchParams({
            search: search,
            maxPrice: maxPrice || '',
            roomTypes: roomTypesStr,
            borough: borough || '',
            minNights: minNights || '',
            minReviews: minReviews || '',
            sortBy: sortBy || 'recommended',
            page: page,
            pageSize: 8
        });

        console.log(params.toString());

        fetch('/Home/GetRentals?' + params.toString())
            .then(res => res.json())
            .then(data => {
                const listings = data.listings || data.Listings || [];
                const stats = data.stats || data.Stats || {};
                const pagination = data.pagination || data.Pagination || {};
                const mapMarkers = data.mapMarkers || data.MapMarkers || [];
                const popularListings = data.popularListings || data.PopularListings || [];
                const charts = data.charts || data.Charts || {};

                currentListingsData = listings;
                listings.forEach(item => {
                    if (favoriteIds.has(item.id)) {
                        favoriteItemsMap[item.id] = item;
                    }
                });
                saveFavoritesToStorage();
                updateStats(stats);
                renderListingsGrid(listings);
                syncFavoriteUI();
                renderPagination(pagination);
                updateMapMarkers(mapMarkers && mapMarkers.length > 0 ? mapMarkers : listings);
                renderPopularWidget(popularListings);
                renderFavoritesDrawer();
                updateChartsWithData(charts);

                // If user clicked Ara & Filtrele button, smoothly scroll to listings grid
                if (isManualSubmit) {
                    const gridEl = document.getElementById('listingsGrid');
                    if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            })
            .catch(err => {
                console.error('Data loading error:', err);
            });
    }

    // ─────────────────────────────────────
    //  5. UI RENDER FUNCTIONS
    // ─────────────────────────────────────

    function updateStats(stats) {
        if (!stats) return;
        document.getElementById('kpiTotalHouses').textContent = (stats.totalCount || 48895).toLocaleString('tr-TR');
        document.getElementById('kpiAvgPrice').textContent = '$' + (stats.avgPrice || 152).toLocaleString('tr-TR');
        document.getElementById('kpiMaxPrice').textContent = '$' + (stats.maxPrice || 10000).toLocaleString('tr-TR') + '+';
        document.getElementById('kpiMinPrice').textContent = '$' + (stats.minPrice || 10).toLocaleString('tr-TR');
        document.getElementById('kpiTotalReviews').textContent = formatCompactNumber(stats.totalReviews || 1520000);
        document.getElementById('kpiAvgRating').textContent = (stats.avgRating || 4.62).toString();
        
        document.getElementById('listingsCountTxt').textContent = '(' + (stats.totalCount || 48895).toLocaleString('tr-TR') + ' sonuç)';
    }

    function formatCompactNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    function renderListingsGrid(listings) {
        const gridContainer = document.getElementById('listingsGrid');
        if (!gridContainer) return;

        console.log("==> RENDER EDİLEN İLK KART FİYATI:", listings && listings.length > 0 ? listings[0].price : "Yok");

        if (!listings || listings.length === 0) {
            gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">Sonuç bulunamadı. Filtrelerinizi değiştirin.</div>';
            return;
        }

        let html = '';
        listings.forEach(item => {
            const isFav = favoriteIds.has(item.id);
            const favClass = isFav ? 'active' : '';
            const heartIcon = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
            const imgUrl = item.imageUrl || getSampleImageForId(item.id);

            html += `
                <div class="property-card" onclick="appUI.selectPropertyById(${item.id})">
                    <div class="card-img-wrap">
                        <img src="${imgUrl}" alt="${escapeHtml(item.name)}" loading="lazy" />
                        <div class="card-price-badge">$${item.price} <small>/ gece</small></div>
                        <button class="fav-btn ${favClass}" onclick="event.stopPropagation(); appUI.toggleFavorite(${item.id}, this)">
                            <i class="${heartIcon}"></i>
                        </button>
                    </div>
                    <div class="card-body-content">
                        <h4 class="prop-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
                        <p class="prop-loc">📍 ${escapeHtml(item.neighbourhood)}, ${escapeHtml(item.borough)}</p>
                        <div class="prop-amenities">
                            <span><i class="fa-solid fa-house-chimney"></i> ${escapeHtml(item.roomType)}</span>
                            <span><i class="fa-solid fa-user"></i> Ev Sahibi: ${escapeHtml(item.hostName || 'Belirtilmemiş')}</span>
                        </div>
                        <div class="prop-rating">
                            <i class="fa-solid fa-star icon-star"></i> ${item.rating} <span style="font-weight:400; color:var(--text-muted);">(${item.reviews} yorum)</span>
                            <span class="min-nights-badge">🌙 Min. ${item.minNights} Gece</span>
                        </div>
                    </div>
                </div>
            `;
        });

        gridContainer.innerHTML = html;
    }

    function renderPagination(pagination) {
        const container = document.getElementById('paginationContainer');
        if (!container || !pagination) return;

        const current = pagination.currentPage;
        const total = pagination.totalPages || 2041;

        let html = `<button class="page-btn" onclick="appUI.fetchData(${Math.max(1, current - 1)})">&lt;</button>`;

        let pages = [1, 2, 3, 4, 5];
        if (current > 3 && current < total - 2) {
            pages = [current - 2, current - 1, current, current + 1, current + 2];
        }

        pages.forEach(p => {
            if (p <= total) {
                const active = p === current ? 'active' : '';
                html += `<button class="page-btn ${active}" onclick="appUI.fetchData(${p})">${p}</button>`;
            }
        });

        if (total > 5) {
            html += `<span style="font-size:0.75rem; color:var(--text-muted);">...</span>`;
            html += `<button class="page-btn" onclick="appUI.fetchData(${total})">${total}</button>`;
        }

        html += `<button class="page-btn" onclick="appUI.fetchData(${Math.min(total, current + 1)})">&gt;</button>`;
        container.innerHTML = html;
    }

    function renderPopularWidget(popularListings) {
        const container = document.getElementById('popularListContainer');
        if (!container || !popularListings || popularListings.length === 0) return;

        let html = '';
        popularListings.forEach((item, idx) => {
            const img = item.imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=300&q=80';
            const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : 'rank-3');
            html += `
                <div class="popular-item-pro" onclick="appUI.selectPropertyById(${item.id})">
                    <div class="rank-badge-pro ${rankClass}">${idx + 1}</div>
                    <div class="pop-thumb-wrap">
                        <img src="${img}" class="pop-thumb-pro" alt="${escapeHtml(item.name)}" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=300&q=80';" />
                    </div>
                    <div class="pop-info-pro">
                        <h5 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h5>
                        <div class="pop-location">📍 ${escapeHtml(item.neighbourhood || item.borough || 'New York')}, NYC</div>
                        <div class="pop-meta">
                            <span><i class="fa-solid fa-star icon-star"></i> ${item.rating || 4.85}</span>
                            <span class="pop-price">$${item.price} <small>/ gece</small></span>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }



    function updateChartsWithData(chartsData) {
        if (!chartsData) return;

        const roomTypes = chartsData.roomTypes || chartsData.RoomTypes || [];
        const boroughPrices = chartsData.boroughPrices || chartsData.BoroughPrices || [];

        // 1. Yuvarlak Donut Grafik (Oda Tipine Göre Dağılım)
        if (donutChartInst && roomTypes.length > 0) {
            const labels = roomTypes.map(x => x.roomType || x.RoomType);
            const counts = roomTypes.map(x => x.count || x.Count);
            const total = counts.reduce((a, b) => a + b, 0);

            donutChartInst.data.labels = labels;
            donutChartInst.data.datasets[0].data = counts;
            donutChartInst.update();

            // Legend alanını dinamik yüzdelerle güncelleme
            const legendContainer = document.getElementById('donutLegendContainer');
            if (legendContainer && total > 0) {
                const colorMap = {
                    'Entire home/apt': { color: 'dot-coral', name: 'Entire Home' },
                    'Private room': { color: 'dot-blue', name: 'Private Room' },
                    'Shared room': { color: 'dot-yellow', name: 'Shared Room' }
                };

                let legendHtml = '';
                roomTypes.forEach(item => {
                    const rType = item.roomType || item.RoomType;
                    const rCount = item.count || item.Count;
                    const pct = Math.round((rCount / total) * 100);
                    const info = colorMap[rType] || { color: 'dot-coral', name: rType };
                    
                    legendHtml += `
                        <div class="legend-row">
                            <span class="dot ${info.color}"></span>
                            <span class="legend-name">${info.name}</span>
                            <strong class="legend-pct">%${pct} <small>(${rCount.toLocaleString('tr-TR')})</small></strong>
                        </div>
                    `;
                });
                legendContainer.innerHTML = legendHtml;
            }
        }

        // 2. Mahallelere Göre Ortalama Fiyat (Yatay Çubuk Grafik)
        if (boroughChartInst && boroughPrices.length > 0) {
            const labels = boroughPrices.map(x => x.borough || x.Borough);
            const prices = boroughPrices.map(x => x.avgPrice || x.AvgPrice);

            boroughChartInst.data.labels = labels;
            boroughChartInst.data.datasets[0].data = prices;
            boroughChartInst.update();
        }
    }

    // ─────────────────────────────────────
    //  6. INTERACTION & MODALS HANDLERS
    // ─────────────────────────────────────



    var sampleUnsplashImages = [
        "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1512915922686-57c11dde9b6b?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560185007-c5ca9d2c014d?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1560185893-a55cbc8c57e8?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1617104551722-3b2d51366400?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600566753376-12c8ab7fb75b?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585152220-90363fe7e115?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80"
    ];

    function getSampleImageForId(id) {
        var num = Math.abs(Number(id) || 0);
        var idx = ((num * 17) + (num % 31)) % sampleUnsplashImages.length;
        return sampleUnsplashImages[idx];
    }

    function selectPropertyById(id) {
        const targetId = Number(id);
        let p = currentListingsData.find(x => Number(x.id) === targetId);
        if (!p && allMarkersRawData && allMarkersRawData.length) {
            const raw = allMarkersRawData.find(x => Number(x.id ?? x.Id) === targetId);
            if (raw) {
                p = {
                    id: targetId,
                    name: raw.name ?? raw.Name ?? ('İlan #' + targetId),
                    neighbourhood: raw.neighbourhood ?? raw.Neighbourhood ?? 'Manhattan',
                    borough: raw.borough ?? raw.Borough ?? 'New York',
                    roomType: raw.roomType ?? raw.RoomType ?? 'Entire home/apt',
                    price: Number(raw.price ?? raw.Price ?? 120),
                    latitude: Number(raw.latitude ?? raw.Latitude ?? 40.7128),
                    longitude: Number(raw.longitude ?? raw.Longitude ?? -74.0060),
                    beds: (targetId % 3) + 1,
                    guests: (targetId % 4) + 2,
                    rating: Math.round((4.5 + ((targetId % 45) / 100.0)) * 100) / 100,
                    reviews: (targetId % 150) + 10,
                    imageUrl: getSampleImageForId(targetId)
                };
            }
        }
        if (!p) {
            p = {
                id: targetId,
                name: 'Harika Konumda Lüks Daire #' + targetId,
                neighbourhood: 'Manhattan',
                borough: 'New York',
                beds: (targetId % 3) + 1,
                guests: (targetId % 4) + 2,
                roomType: 'Entire home/apt',
                rating: 4.85,
                reviews: 110,
                price: 120,
                imageUrl: getSampleImageForId(targetId)
            };
        }

        activeProperty = p;

        // Show Map Popup Card Overlay
        const popupCard = document.getElementById('mapPopupCard');
        if (popupCard) {
            document.getElementById('popImg').src = p.imageUrl;
            document.getElementById('popTitle').textContent = p.name;
            document.getElementById('popLoc').textContent = '📍 ' + p.neighbourhood + ', ' + p.borough;
            document.getElementById('popBeds').innerHTML = `<i class="fa-solid fa-bed"></i> ${p.beds} yatak`;
            document.getElementById('popGuests').innerHTML = `<i class="fa-solid fa-user-group"></i> ${p.guests} misafir`;
            document.getElementById('popRoomType').innerHTML = `<i class="fa-solid fa-house-chimney"></i> ${p.roomType}`;
            document.getElementById('popRating').textContent = p.rating;
            document.getElementById('popReviews').textContent = `(${p.reviews} yorum)`;
            document.getElementById('popPrice').textContent = '$' + p.price;

            popupCard.classList.add('show');
        }

        // Highlight active property marker on map
        document.querySelectorAll('.custom-map-price-marker').forEach(el => el.classList.remove('selected-active-marker'));
        const activeMarkerEl = document.getElementById('mapMarker_' + p.id);
        if (activeMarkerEl) {
            activeMarkerEl.classList.add('selected-active-marker');
        }

        // Fly map to location with close zoom level
        if (map && p.latitude && p.longitude) {
            map.flyTo([p.latitude, p.longitude], 15, { duration: 1.0 });

            // Trigger popup on Leaflet marker if exists
            const markerInst = markerMap.get(targetId);
            if (markerInst) {
                markerInst.openPopup();
            }
        }
        // Directly open full detail modal on image click
        openDetailModal();
    }

    function closeMapPopup() {
        const popupCard = document.getElementById('mapPopupCard');
        if (popupCard) popupCard.classList.remove('show');
    }

    // ── Detail Full-Page Modal ──
    var detailMiniMap = null;
    var detailMiniMarker = null;

    // Demo review data
    var demoReviewers = [
        { name: 'Sarah M.', color: '#6366f1' },
        { name: 'Ahmet K.', color: '#ef4444' },
        { name: 'Emily R.', color: '#10b981' },
        { name: 'Carlos D.', color: '#f59e0b' },
        { name: 'Yuki T.', color: '#8b5cf6' },
        { name: 'Maria L.', color: '#ec4899' }
    ];
    var demoComments = [
        'Harika bir konaklama deneyimiydi! Konum mükemmel, ev sahibi çok ilgili. Kesinlikle tekrar geleceğim.',
        'Temiz ve bakımlı bir yer. Ulaşım çok kolay, metroya yürüme mesafesinde. Tavsiye ederim.',
        'Fiyat/performans olarak çok iyi. Fotoğraflardaki gibi görünüyor. Mutfak ekipmanları yeterli.',
        'Güzel bir mahallede, sessiz ve huzurlu. Çevrede restoran ve kafe çok fazla.',
        'Ev sahibi çok yardımsever ve iletişime açık. Check-in süreci çok kolaydı.',
        'Modern ve şık tasarım. WiFi hızlı, yatak rahat. İş seyahati için ideal.'
    ];

    function getLocalSimilarListings(item) {
        if (!currentListingsData || !currentListingsData.length) return [];
        const itemBorough = item.borough || item.neighbourhood_group || '';
        let list = currentListingsData.filter(x => x.id !== item.id && (x.borough === itemBorough || x.neighbourhood === item.neighbourhood));
        if (list.length < 3) {
            list = currentListingsData.filter(x => x.id !== item.id);
        }
        return list.slice(0, 6);
    }

    function openDetailModal() {
        if (!activeProperty) return;
        const modal = document.getElementById('detailModalOverlay');
        if (!modal) return;

        // Show modal immediately
        modal.classList.add('show');
        document.getElementById('dfmLoading').style.display = 'none';
        document.getElementById('dfmContent').style.display = 'block';

        // Render instantly with local property data + local similar listings
        const localSimilar = getLocalSimilarListings(activeProperty);
        renderDetailModal(activeProperty, localSimilar);

        // Asynchronously fetch extra backend data to enrich if available (non-blocking)
        fetch('/Home/GetRentalById?id=' + activeProperty.id)
            .then(r => r.json())
            .then(data => {
                if (data && data.success && data.listing) {
                    renderDetailModal(data.listing, (data.similarListings && data.similarListings.length) ? data.similarListings : localSimilar);
                }
            })
            .catch(() => {
                // Already rendered locally
            });
    }

    function renderDetailModal(listing, similarListings) {
        // Hide loading, show content
        document.getElementById('dfmLoading').style.display = 'none';
        document.getElementById('dfmContent').style.display = 'block';

        // Hero image
        document.getElementById('dfmImg').src = listing.imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80';

        // Price
        document.getElementById('dfmPrice').innerHTML = '$' + listing.price + ' <small>/ gece</small>';

        // Fav button state
        var favIds = JSON.parse(localStorage.getItem('nycFavorites') || '[]');
        var dfmFavBtn = document.getElementById('dfmFavBtn');
        var dfmFavIcon = document.getElementById('dfmFavIcon');
        if (favIds.includes(listing.id)) {
            dfmFavBtn.classList.add('active');
            dfmFavIcon.className = 'fa-solid fa-heart';
        } else {
            dfmFavBtn.classList.remove('active');
            dfmFavIcon.className = 'fa-regular fa-heart';
        }

        // Badges
        document.getElementById('dfmBadgeRoom').textContent = listing.roomType || 'Entire home/apt';
        document.getElementById('dfmBadgeBorough').textContent = listing.borough || 'New York';

        // Title & Location
        document.getElementById('dfmTitle').textContent = listing.name || 'İlan #' + listing.id;
        document.getElementById('dfmLocation').innerHTML = '<i class="fa-solid fa-location-dot"></i> ' +
            escapeHtml(listing.neighbourhood || '') + ', ' + escapeHtml(listing.borough || 'New York') + ', ABD';

        // Rating
        document.getElementById('dfmRating').textContent = listing.rating || '4.85';
        document.getElementById('dfmReviewCount').textContent = listing.reviews || '0';

        // Host
        document.getElementById('dfmHostName').textContent = listing.hostName || 'Belirtilmemiş';
        document.getElementById('dfmHostListings').textContent = listing.hostListings || '1';

        // Stats
        document.getElementById('dfmBeds').textContent = listing.beds || '1';
        document.getElementById('dfmGuests').textContent = listing.guests || '2';
        document.getElementById('dfmMinNights').textContent = listing.minNights || '1';
        document.getElementById('dfmAvailability').textContent = listing.availability || '365';
        document.getElementById('dfmReviewsPerMonth').textContent = listing.reviewsPerMonth ? listing.reviewsPerMonth.toFixed(1) : '0';
        document.getElementById('dfmLastReview').textContent = listing.lastReview || '-';

        // ── Mini Map ──
        var mapWrap = document.getElementById('dfmMapWrap');
        mapWrap.innerHTML = '';
        var lat = listing.latitude || 40.7128;
        var lng = listing.longitude || -74.0060;

        setTimeout(function() {
            if (detailMiniMap) { detailMiniMap.remove(); detailMiniMap = null; }
            detailMiniMap = L.map(mapWrap, { scrollWheelZoom: false, zoomControl: true, dragging: true }).setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
            }).addTo(detailMiniMap);
            detailMiniMarker = L.marker([lat, lng]).addTo(detailMiniMap)
                .bindPopup('<b>' + escapeHtml(listing.name || '') + '</b><br>$' + listing.price + '/gece')
                .openPopup();
            setTimeout(function() { detailMiniMap.invalidateSize(); }, 200);
        }, 100);

        // ── Reviews ──
        var reviewCount = listing.reviews || 0;
        var displayReviews = Math.min(reviewCount, 6);
        if (displayReviews < 2) displayReviews = 4; // always show at least demo reviews

        document.getElementById('dfmReviewSectionCount').textContent = '(' + reviewCount + ')';

        var reviewHtml = '';
        for (var i = 0; i < displayReviews; i++) {
            var reviewer = demoReviewers[i % demoReviewers.length];
            var comment = demoComments[i % demoComments.length];
            var stars = Math.floor(3.5 + Math.random() * 1.5 + 0.5);
            var starsHtml = '';
            for (var s = 0; s < 5; s++) {
                starsHtml += s < stars ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
            }
            var months = Math.floor(Math.random() * 11) + 1;

            reviewHtml += '<div class="dfm-review-card">' +
                '<div class="dfm-review-header">' +
                    '<div class="dfm-review-avatar" style="background:' + reviewer.color + '">' + reviewer.name.charAt(0) + '</div>' +
                    '<div class="dfm-review-meta">' +
                        '<div class="dfm-review-name">' + reviewer.name + '</div>' +
                        '<div class="dfm-review-stars">' + starsHtml + '</div>' +
                        '<div class="dfm-review-date">' + months + ' ay önce</div>' +
                    '</div>' +
                '</div>' +
                '<p class="dfm-review-text">' + comment + '</p>' +
            '</div>';
        }
        document.getElementById('dfmReviewsGrid').innerHTML = reviewHtml;

        // ── Similar Listings ──
        var similarHtml = '';
        if (similarListings && similarListings.length > 0) {
            similarListings.forEach(function(s) {
                similarHtml += '<div class="dfm-similar-card" onclick="appUI.openSimilarListing(' + s.id + ')">' +
                    '<img class="dfm-similar-img" src="' + (s.imageUrl || '') + '" alt="' + escapeHtml(s.name || '') + '" />' +
                    '<div class="dfm-similar-body">' +
                        '<div class="dfm-similar-title">' + escapeHtml(s.name || 'İlan') + '</div>' +
                        '<div class="dfm-similar-loc">📍 ' + escapeHtml(s.neighbourhood || '') + '</div>' +
                        '<div class="dfm-similar-bottom">' +
                            '<span class="dfm-similar-price">$' + s.price + '</span>' +
                            '<span class="dfm-similar-rating"><i class="fa-solid fa-star"></i> ' + s.rating + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
        } else {
            similarHtml = '<p style="color:var(--text-muted); font-size:0.85rem;">Bu bölgede benzer ilan bulunamadı.</p>';
        }
        document.getElementById('dfmSimilarScroll').innerHTML = similarHtml;
    }

    function openSimilarListing(id) {
        activeProperty = { id: id };
        openDetailModal();
    }

    function toggleDetailFav() {
        if (!activeProperty) return;
        var favIds = JSON.parse(localStorage.getItem('nycFavorites') || '[]');
        var idx = favIds.indexOf(activeProperty.id);
        var dfmFavBtn = document.getElementById('dfmFavBtn');
        var dfmFavIcon = document.getElementById('dfmFavIcon');
        if (idx > -1) {
            favIds.splice(idx, 1);
            dfmFavBtn.classList.remove('active');
            dfmFavIcon.className = 'fa-regular fa-heart';
        } else {
            favIds.push(activeProperty.id);
            dfmFavBtn.classList.add('active');
            dfmFavIcon.className = 'fa-solid fa-heart';
        }
        localStorage.setItem('nycFavorites', JSON.stringify(favIds));
        if (typeof updateFavCount === 'function') updateFavCount();
    }

    function closeDetailModal() {
        const modal = document.getElementById('detailModalOverlay');
        if (modal) modal.classList.remove('show');
        if (detailMiniMap) { detailMiniMap.remove(); detailMiniMap = null; }
    }

    function toggleTheme() {
        const html = document.documentElement;
        const icon = document.getElementById('themeIcon');
        if (html.getAttribute('data-theme') === 'dark') {
            html.setAttribute('data-theme', 'light');
            if (icon) icon.className = 'fa-solid fa-moon';
        } else {
            html.setAttribute('data-theme', 'dark');
            if (icon) icon.className = 'fa-solid fa-sun';
        }
    }

    function toggleNotifications() {
        const notif = document.getElementById('notifModal');
        if (notif) notif.classList.toggle('show');
        const userM = document.getElementById('userModal');
        if (userM) userM.classList.remove('show');
    }

    function toggleUserMenu() {
        const userM = document.getElementById('userModal');
        if (userM) userM.classList.toggle('show');
        const notif = document.getElementById('notifModal');
        if (notif) notif.classList.remove('show');
    }

    function toggleFavoritesDrawer() {
        const drawer = document.getElementById('favoritesDrawer');
        const favTabBtn = document.querySelector('.fav-tab');
        if (drawer) {
            const isOpened = drawer.style.transform === 'translateY(0)';
            if (isOpened) {
                drawer.style.transform = 'translateY(120px)';
                if (favTabBtn) favTabBtn.classList.remove('active');
            } else {
                drawer.style.transform = 'translateY(0)';
                if (favTabBtn) favTabBtn.classList.add('active');
            }
        }
    }

    let isScrollSpyLock = false;

    function switchTab(tabName) {
        const mapContainer = document.getElementById('mapSectionContainer');

        if (tabName === 'map') {
            const mapLink = document.querySelector(`.nav-item[onclick*="map"]`);
            const isAlreadyActive = mapLink && mapLink.classList.contains('active');
            if (isAlreadyActive && mapContainer && mapContainer.classList.contains('expanded')) {
                toggleMapExpand(false);
                const homeLink = document.querySelector(`.nav-item[onclick*="home"]`);
                if (homeLink) homeLink.classList.add('active');
            } else {
                toggleMapExpand(true);
            }
            return;
        }

        if (mapContainer && mapContainer.classList.contains('expanded')) {
            toggleMapExpand(false);
        }

        isScrollSpyLock = true;
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        const targetLink = document.querySelector(`.nav-item[onclick*="${tabName}"]`);
        if (targetLink) targetLink.classList.add('active');

        if (tabName === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (tabName === 'explore') {
            document.getElementById('exploreSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (tabName === 'statistics') {
            document.getElementById('statisticsSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (tabName === 'favorites') {
            renderFavoritesPage();
            document.getElementById('favoritesSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (tabName === 'compare') {
            renderComparePage();
            document.getElementById('compareSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        setTimeout(() => {
            isScrollSpyLock = false;
        }, 850);
    }

    function initScrollSpy() {
        window.addEventListener('scroll', function () {
            if (isScrollSpyLock) return;

            const mapContainer = document.getElementById('mapSectionContainer');
            if (mapContainer && mapContainer.classList.contains('expanded')) return;

            const scrollY = window.scrollY;

            const secHome = document.querySelector('.kpi-grid');
            const secExplore = document.getElementById('exploreSection');
            const secStat = document.getElementById('statisticsSection');
            const secFav = document.getElementById('favoritesSection');
            const secComp = document.getElementById('compareSection');

            const sections = [
                { name: 'home', el: secHome },
                { name: 'explore', el: secExplore },
                { name: 'statistics', el: secStat },
                { name: 'favorites', el: secFav },
                { name: 'compare', el: secComp }
            ];

            let activeTab = 'home';
            const offset = 220;

            sections.forEach(s => {
                if (s.el) {
                    const top = s.el.offsetTop - offset;
                    if (scrollY >= top) {
                        activeTab = s.name;
                    }
                }
            });

            document.querySelectorAll('.nav-item').forEach(el => {
                if (!el.classList.contains('filter-toggle-nav-btn') && !el.getAttribute('onclick')?.includes('map')) {
                    el.classList.remove('active');
                }
            });

            const currentLink = document.querySelector(`.nav-item[onclick*="${activeTab}"]`);
            if (currentLink) currentLink.classList.add('active');
        });
    }

    let activeBoroughModalName = '';

    const boroughData = {
        'Manhattan': {
            title: 'Manhattan Bölge Rehberi',
            subtitle: "New York'un simgesel gökdelenleri, Broadway tiyatroları ve 24 saat kesintisiz yaşayan finans & kültür kalbi.",
            avgPrice: '$196',
            totalListings: '21.661',
            avgRating: '4.85 / 5',
            attractions: 'Times Square, Central Park, Empire State Binası, Wall Street, Greenwich Village, Soho, High Line Park.',
            imageUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=800&q=80',
            badge: 'Lüks & Finans Merkezi'
        },
        'Brooklyn': {
            title: 'Brooklyn Bölge Rehberi',
            subtitle: "Sanat galerileri, gurme kahve dükkanları, hipster kültürü ve muhteşem Manhattan silüeti manzaraları.",
            avgPrice: '$124',
            totalListings: '20.104',
            avgRating: '4.80 / 5',
            attractions: 'Brooklyn Köprüsü, Williamsburg, DUMBO, Prospect Park, Brooklyn Müzesi, Coney Island.',
            imageUrl: 'https://images.unsplash.com/photo-1543716091-a840c05249ec?auto=format&fit=crop&w=800&q=80',
            badge: 'Sanat & Hipster Ruhu'
        },
        'Queens': {
            title: 'Queens Bölge Rehberi',
            subtitle: "Etnik çeşitlilik, dünya mutfaklarından lezzetler, bütçe dostu konaklama seçenekleri ve parklar.",
            avgPrice: '$99',
            totalListings: '5.666',
            avgRating: '4.72 / 5',
            attractions: 'Astoria Park, Flushing Meadows Corona Park, Museum of the Moving Image, Citi Field Stadyumu.',
            imageUrl: 'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=800&q=80',
            badge: 'Kültür Mozaiği & Bütçe Dostu'
        },
        'Bronx': {
            title: 'Bronx Bölge Rehberi',
            subtitle: "Zengin hip-hop tarihi, beyzbol heyecanı, tarihi İtalyan mahallesi ve geniş botanik bahçeleri.",
            avgPrice: '$87',
            totalListings: '1.091',
            avgRating: '4.65 / 5',
            attractions: 'Yankee Stadyumu, New York Botanik Bahçesi, Bronx Hayvan Bahçesi, Arthur Avenue (Little Italy).',
            imageUrl: 'https://images.unsplash.com/photo-1572953109213-3be62398eb95?auto=format&fit=crop&w=800&q=80',
            badge: 'Tarih & Doğa Parkları'
        }
    };

    const boroughGalleries = {
        'Manhattan': [
            'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1506966953377-365002b07a73?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=400&q=80'
        ],
        'Brooklyn': [
            'https://images.unsplash.com/photo-1543716091-a840c05249ec?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=400&q=80'
        ],
        'Queens': [
            'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=400&q=80'
        ],
        'Bronx': [
            'https://images.unsplash.com/photo-1572953109213-3be62398eb95?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?auto=format&fit=crop&w=400&q=80',
            'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=400&q=80'
        ]
    };

    function openBoroughModal(boroughName) {
        const detailView = document.getElementById('exploreDetailView');
        const exploreCardsSection = document.getElementById('exploreSection');
        const data = boroughData[boroughName];
        if (!detailView || !data) return;

        activeBoroughModalName = boroughName;

        document.getElementById('bModalImg').src = data.imageUrl;
        document.getElementById('bModalBadge').textContent = data.badge;
        document.getElementById('bModalTitle').textContent = data.title;
        document.getElementById('bModalSubtitle').textContent = data.subtitle;
        document.getElementById('bModalAvgPrice').textContent = data.avgPrice;
        document.getElementById('bModalTotalListings').textContent = data.totalListings;
        document.getElementById('bModalAvgRating').textContent = data.avgRating;
        document.getElementById('bModalAttractions').textContent = data.attractions;

        const btnNameEl = document.getElementById('bModalBtnName');
        if (btnNameEl) btnNameEl.textContent = boroughName;

        // Render Gallery Photos
        const galleryEl = document.getElementById('bModalGallery');
        const photos = boroughGalleries[boroughName] || boroughGalleries['Manhattan'];
        if (galleryEl && photos) {
            galleryEl.innerHTML = photos.map(pUrl => `
                <img src="${pUrl}" style="width:100%; height:140px; object-fit:cover; border-radius:10px;" alt="${boroughName}" />
            `).join('');
        }

        // Render Featured Homes for this Borough
        const featuredHomesEl = document.getElementById('bModalFeaturedHomes');
        if (featuredHomesEl) {
            const filteredList = currentListingsData.filter(x => (x.borough || '').toLowerCase() === boroughName.toLowerCase());
            const displayList = (filteredList.length > 0 ? filteredList : currentListingsData).slice(0, 2);

            let homesHtml = '';
            displayList.forEach(item => {
                homesHtml += `
                    <div class="property-card no-img-card" style="padding:0.9rem;" onclick="appUI.closeBoroughModal(); appUI.selectPropertyById(${item.id})">
                        <div class="card-text-header" style="margin-bottom:0.4rem;">
                            <div class="card-price-badge-inline">$${item.price} <small>/ gece</small></div>
                            <span style="font-size:0.78rem; color:var(--text-muted);"><i class="fa-solid fa-star icon-star"></i> ${item.rating}</span>
                        </div>
                        <div class="card-body-content">
                            <h4 class="prop-title" style="font-size:0.88rem;" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h4>
                            <p class="prop-loc" style="font-size:0.75rem; margin:0;">📍 ${escapeHtml(item.neighbourhood)}, ${escapeHtml(item.borough)}</p>
                        </div>
                    </div>
                `;
            });
            featuredHomesEl.innerHTML = homesHtml;
        }

        if (exploreCardsSection) exploreCardsSection.style.display = 'none';
        detailView.style.display = 'block';
        detailView.scrollIntoView({ behavior: 'smooth' });
    }

    function closeBoroughModal() {
        const detailView = document.getElementById('exploreDetailView');
        const exploreCardsSection = document.getElementById('exploreSection');
        if (detailView) detailView.style.display = 'none';
        if (exploreCardsSection) {
            exploreCardsSection.style.display = 'block';
            exploreCardsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }

    function applyBoroughFilterFromModal() {
        closeBoroughModal();
        if (activeBoroughModalName) {
            filterByBoroughFromExplore(activeBoroughModalName);
        }
    }

    function filterByBoroughFromExplore(boroughName) {
        const boroughSel = document.getElementById('selBorough');
        if (boroughSel) {
            boroughSel.value = boroughName;
        }
        switchTab('home');
        fetchData();
    }

    function updatePriceLabel(val) {
        const badge = document.getElementById('rangeBadgeText');
        const maxVal = document.getElementById('maxPriceVal');
        if (badge) badge.textContent = '$10 - $' + val + (val >= 1000 ? '+' : '');
        if (maxVal) maxVal.textContent = '$' + val + (val >= 1000 ? '+' : '');
        fetchData();
    }

    function updateReviewsLabel(val) {
        const badge = document.getElementById('reviewsBadgeText');
        if (badge) badge.textContent = val + ' - 1000+';
        fetchData();
    }

    function toggleAllRoomTypes(masterChk) {
        document.querySelectorAll('.chk-room').forEach(chk => {
            chk.checked = masterChk.checked;
        });
        fetchData();
    }

    function onRoomTypeChange() {
        fetchData();
    }

    function clearFilters() {
        document.getElementById('keywordInput').value = '';
        document.getElementById('topSearchInput').value = '';
        document.getElementById('priceRangeInput').value = 1000;
        updatePriceLabel(1000);
        document.getElementById('selBorough').value = '';
        document.getElementById('selMinNights').value = '';
        document.getElementById('reviewsRangeInput').value = 0;
        updateReviewsLabel(0);
        document.getElementById('chkRoomAll').checked = true;
        document.querySelectorAll('.chk-room').forEach(chk => chk.checked = true);
        document.getElementById('selSortBy').value = 'recommended';

        fetchData();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function toggleMapExpand(forceExpand = null) {
        const container = document.getElementById('mapSectionContainer');
        const icon = document.getElementById('mapExpandIcon');
        if (!container) return;

        let isExpanded = false;
        if (forceExpand === true) {
            container.classList.add('expanded');
            isExpanded = true;
        } else if (forceExpand === false) {
            container.classList.remove('expanded');
            isExpanded = false;
        } else {
            isExpanded = container.classList.toggle('expanded');
        }

        if (icon) {
            if (isExpanded) {
                icon.className = 'fa-solid fa-compress';
                container.setAttribute('title', 'Haritayı Küçült');
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                const mapLink = document.querySelector(`.nav-item[onclick*="map"]`);
                if (mapLink) mapLink.classList.add('active');
            } else {
                icon.className = 'fa-solid fa-expand';
                container.setAttribute('title', 'Haritayı Büyüt (Tam Ekran)');
                const homeLink = document.querySelector(`.nav-item[onclick*="home"]`);
                if (homeLink) homeLink.classList.add('active');
            }
        }

        // Trigger Leaflet map resize event after transition
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 350);
    }

    function toggleNavFilters() {
        const overlay = document.getElementById('navFiltersOverlay');
        if (overlay) {
            overlay.classList.toggle('show');
        }
        const notif = document.getElementById('notifModal');
        if (notif) notif.classList.remove('show');
        const userM = document.getElementById('userModal');
        if (userM) userM.classList.remove('show');
    }

    function toggleSidebarPanel() {
        const grid = document.querySelector('.dashboard-grid');
        const btn = document.querySelector('.filter-toggle-nav-btn');
        if (grid) {
            const isHidden = grid.classList.toggle('sidebar-hidden');
            if (btn) {
                if (isHidden) {
                    btn.classList.remove('active');
                } else {
                    btn.classList.add('active');
                }
            }
            // Trigger map resize so leaflet map smoothly adapts to full width
            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 300);
        }
    }

    // ─────────────────────────────────────
    //  7. RESERVATION & BOOKING WORKFLOW
    // ─────────────────────────────────────

    function openBookingModal() {
        closeDetailModal();
        const bookingModal = document.getElementById('bookingModalOverlay');
        if (!bookingModal) return;

        if (activeProperty) {
            const propTitle = document.getElementById('bookingPropTitle');
            const roomTypeInput = document.getElementById('bookRoomTypeReadonly');
            if (propTitle) propTitle.textContent = activeProperty.name;
            if (roomTypeInput) roomTypeInput.value = activeProperty.roomType || 'Entire home/apt';
        }

        // Set default dates (Tomorrow -> 3 days later)
        const checkInInput = document.getElementById('bookCheckIn');
        const checkOutInput = document.getElementById('bookCheckOut');
        
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const next3Days = new Date(tomorrow);
        next3Days.setDate(next3Days.getDate() + 3);

        if (checkInInput && !checkInInput.value) {
            checkInInput.value = tomorrow.toISOString().split('T')[0];
        }
        if (checkOutInput && !checkOutInput.value) {
            checkOutInput.value = next3Days.toISOString().split('T')[0];
        }

        calculateBookingTotal();
        goToBookingStep(1);

        // Reset success screen
        document.getElementById('bookingForm').style.display = 'block';
        document.getElementById('bookingSuccessScreen').style.display = 'none';

        bookingModal.classList.add('show');
    }

    function closeBookingModal() {
        const bookingModal = document.getElementById('bookingModalOverlay');
        if (bookingModal) bookingModal.classList.remove('show');
    }

    function calculateBookingTotal() {
        if (!activeProperty) return;
        const pricePerNight = activeProperty.price || 120;
        const checkInVal = document.getElementById('bookCheckIn')?.value;
        const checkOutVal = document.getElementById('bookCheckOut')?.value;

        let nightCount = 3;
        if (checkInVal && checkOutVal) {
            const d1 = new Date(checkInVal);
            const d2 = new Date(checkOutVal);
            const diffTime = d2 - d1;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) nightCount = diffDays;
        }

        const basePrice = pricePerNight * nightCount;
        const cleaningFee = 45;
        const serviceFee = 30;
        const totalPrice = basePrice + cleaningFee + serviceFee;

        document.getElementById('calcNightRate').innerHTML = `$${pricePerNight} x <strong id="calcNightCount">${nightCount} gece</strong>`;
        document.getElementById('calcBasePrice').textContent = `$${basePrice}`;
        document.getElementById('calcTotalPrice').textContent = `$${totalPrice}`;
        document.getElementById('btnPayAmount').textContent = `$${totalPrice}`;
    }

    function showFieldError(inputId, errorText) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.classList.add('input-error-border');

        // Check if error message already exists
        let parent = input.parentElement;
        let errEl = parent.querySelector('.field-error-msg');
        if (!errEl) {
            errEl = document.createElement('div');
            errEl.className = 'field-error-msg';
            parent.appendChild(errEl);
        }
        errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${errorText}`;
    }

    function clearFieldError(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.classList.remove('input-error-border');
        const parent = input.parentElement;
        const errEl = parent.querySelector('.field-error-msg');
        if (errEl) {
            errEl.remove();
        }
    }

    function validateBookingStep(currentStep) {
        let isValid = true;

        if (currentStep === 1) {
            const checkInInput = document.getElementById('bookCheckIn');
            const checkOutInput = document.getElementById('bookCheckOut');

            clearFieldError('bookCheckIn');
            clearFieldError('bookCheckOut');

            if (!checkInInput?.value) {
                showFieldError('bookCheckIn', 'Giriş tarihi boş bırakılamaz!');
                isValid = false;
            }
            if (!checkOutInput?.value) {
                showFieldError('bookCheckOut', 'Çıkış tarihi boş bırakılamaz!');
                isValid = false;
            }
            if (checkInInput?.value && checkOutInput?.value && new Date(checkOutInput.value) <= new Date(checkInInput.value)) {
                showFieldError('bookCheckOut', 'Çıkış tarihi, girişten sonra olmalıdır!');
                isValid = false;
            }
        } else if (currentStep === 2) {
            const firstName = document.getElementById('bookFirstName');
            const lastName = document.getElementById('bookLastName');
            const email = document.getElementById('bookEmail');
            const phone = document.getElementById('bookPhone');

            clearFieldError('bookFirstName');
            clearFieldError('bookLastName');
            clearFieldError('bookEmail');
            clearFieldError('bookPhone');

            if (!firstName?.value?.trim()) {
                showFieldError('bookFirstName', 'Lütfen adınızı giriniz!');
                isValid = false;
            }
            if (!lastName?.value?.trim()) {
                showFieldError('bookLastName', 'Lütfen soyadınızı giriniz!');
                isValid = false;
            }
            if (!email?.value?.trim() || !email.value.includes('@')) {
                showFieldError('bookEmail', 'Geçerli bir e-posta giriniz!');
                isValid = false;
            }
            if (!phone?.value?.trim() || phone.value.trim().length < 7) {
                showFieldError('bookPhone', 'Geçerli bir telefon numarası giriniz!');
                isValid = false;
            }
        } else if (currentStep === 3) {
            const cardHolder = document.getElementById('cardHolder');
            const cardNumber = document.getElementById('cardNumber');
            const cardExpiry = document.getElementById('cardExpiry');
            const cardCvc = document.getElementById('cardCvc');

            clearFieldError('cardHolder');
            clearFieldError('cardNumber');
            clearFieldError('cardExpiry');
            clearFieldError('cardCvc');

            if (!cardHolder?.value?.trim()) {
                showFieldError('cardHolder', 'Kart üzerindeki isim boş bırakılamaz!');
                isValid = false;
            }
            if (!cardNumber?.value?.trim() || cardNumber.value.trim().length < 12) {
                showFieldError('cardNumber', 'Geçerli bir kart numarası giriniz (16 hane)!');
                isValid = false;
            }
            if (!cardExpiry?.value?.trim() || !cardExpiry.value.includes('/')) {
                showFieldError('cardExpiry', 'Son kullanma tarihi MM/YY olmalıdır!');
                isValid = false;
            }
            if (!cardCvc?.value?.trim() || cardCvc.value.trim().length < 3) {
                showFieldError('cardCvc', 'CVC kodu 3 veya 4 haneli olmalıdır!');
                isValid = false;
            }
        }

        return isValid;
    }

    function goToBookingStep(stepNumber) {
        // Find currently active step number
        const activeContent = document.querySelector('.booking-step-content.active');
        let currentStep = 1;
        if (activeContent && activeContent.id) {
            currentStep = parseInt(activeContent.id.replace('bookingStep', '')) || 1;
        }

        // If advancing forward, validate the current step first
        if (stepNumber > currentStep) {
            if (!validateBookingStep(currentStep)) {
                return;
            }
        }

        document.querySelectorAll('.booking-step-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.booking-steps-bar .step-item').forEach(el => el.classList.remove('active'));

        const targetStep = document.getElementById('bookingStep' + stepNumber);
        const targetIndicator = document.getElementById('step' + stepNumber + 'Indicator');

        if (targetStep) targetStep.classList.add('active');
        if (targetIndicator) targetIndicator.classList.add('active');
    }

    function submitBooking() {
        if (!validateBookingStep(3)) {
            return;
        }

        const email = document.getElementById('bookEmail')?.value || 'misafir@example.com';
        const totalPrice = document.getElementById('calcTotalPrice')?.textContent || '$435';
        const checkIn = document.getElementById('bookCheckIn')?.value;
        const checkOut = document.getElementById('bookCheckOut')?.value;

        // Hide form steps and show success screen
        document.querySelectorAll('.booking-step-content').forEach(el => el.style.display = 'none');
        const successScreen = document.getElementById('bookingSuccessScreen');
        if (successScreen) {
            document.getElementById('successCustomerEmail').textContent = email;
            if (activeProperty) document.getElementById('successPropTitle').textContent = activeProperty.name;
            if (checkIn && checkOut) document.getElementById('successDates').textContent = `${checkIn} ile ${checkOut} arası`;
            document.getElementById('successPaidAmount').textContent = totalPrice;

            successScreen.style.display = 'block';
        }
    }

    const guestCounts = { adults: 0, children: 0, babies: 0, pets: 0 };

    function updateGuestCount(type, delta) {
        if (!guestCounts.hasOwnProperty(type)) return;

        guestCounts[type] = Math.max(0, guestCounts[type] + delta);

        const cntEl = document.getElementById('cnt' + type.charAt(0).toUpperCase() + type.slice(1));
        if (cntEl) cntEl.textContent = guestCounts[type];

        const totalGuests = guestCounts.adults + guestCounts.children;
        const totalTxtEl = document.getElementById('totalGuestsCountTxt');
        if (totalTxtEl) {
            let label = totalGuests + ' Misafir';
            if (guestCounts.babies > 0) label += `, ${guestCounts.babies} Bebek`;
            if (guestCounts.pets > 0) label += `, ${guestCounts.pets} Evcil H.`;
            totalTxtEl.textContent = label;
        }

        // Trigger live list filter refresh
        fetchData();
    }

    // ── Auth & Profile Modal Handlers ──
    let currentUserState = {
        isLoggedIn: true,
        name: 'Tuana Kara',
        email: 'tuana.kara@example.com',
        avatar: '/images/default-avatar.png'
    };

    function updateHeaderUserUI() {
        const headerName = document.getElementById('userHeaderName');
        const headerAvatar = document.getElementById('userHeaderAvatar');
        const statusDot = document.getElementById('userStatusDot');

        const loggedInHeader = document.getElementById('userModalLoggedInHeader');
        const authActions = document.getElementById('userModalAuthActions');
        const logoutBtn = document.getElementById('btnLogoutBtn');

        const modalName = document.getElementById('userModalName');
        const modalEmail = document.getElementById('userModalEmail');
        const modalAvatar = document.getElementById('userModalAvatar');

        if (currentUserState.isLoggedIn) {
            if (headerName) headerName.textContent = currentUserState.name;
            if (headerAvatar) headerAvatar.src = currentUserState.avatar;
            if (statusDot) statusDot.style.backgroundColor = '#10b981';

            if (loggedInHeader) loggedInHeader.style.display = 'block';
            if (authActions) authActions.style.display = 'none';
            if (logoutBtn) logoutBtn.style.display = 'flex';

            if (modalName) modalName.textContent = currentUserState.name;
            if (modalEmail) modalEmail.textContent = currentUserState.email;
            if (modalAvatar) modalAvatar.src = currentUserState.avatar;
        } else {
            if (headerName) headerName.textContent = 'Giriş Yap / Kaydol';
            if (headerAvatar) headerAvatar.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80';
            if (statusDot) statusDot.style.backgroundColor = '#94a3b8';

            if (loggedInHeader) loggedInHeader.style.display = 'none';
            if (authActions) authActions.style.display = 'block';
            if (logoutBtn) logoutBtn.style.display = 'none';
        }
    }

    function openLoginModal() {
        const modal = document.getElementById('loginModalOverlay');
        const userModal = document.getElementById('userModal');
        if (userModal) userModal.classList.remove('show');
        if (modal) modal.classList.add('show');
    }

    function closeLoginModal() {
        const modal = document.getElementById('loginModalOverlay');
        if (modal) modal.classList.remove('show');
    }

    function submitLogin() {
        const email = document.getElementById('loginEmail')?.value || 'tuana.kara@example.com';
        const namePart = email.split('@')[0];
        const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

        currentUserState.isLoggedIn = true;
        currentUserState.email = email;
        currentUserState.name = formattedName === 'Tuana.kara' ? 'Tuana Kara' : formattedName;

        updateHeaderUserUI();
        closeLoginModal();
        alert('🎉 Hoş geldiniz ' + currentUserState.name + '! Oturumunuz başarıyla açıldı.');
    }

    function quickSocialLogin(provider) {
        currentUserState.isLoggedIn = true;
        currentUserState.name = 'Tuana Kara';
        currentUserState.email = 'tuana.kara@example.com';
        updateHeaderUserUI();
        closeLoginModal();
        alert('🎉 ' + provider + ' ile hızlı giriş başarılı! Hoş geldiniz Tuana Kara.');
    }

    function openRegisterModal() {
        const modal = document.getElementById('registerModalOverlay');
        const userModal = document.getElementById('userModal');
        if (userModal) userModal.classList.remove('show');
        if (modal) modal.classList.add('show');
    }

    function closeRegisterModal() {
        const modal = document.getElementById('registerModalOverlay');
        if (modal) modal.classList.remove('show');
    }

    function submitRegister() {
        const fullName = document.getElementById('regFullName')?.value || 'Yeni Üye';
        const email = document.getElementById('regEmail')?.value || 'uye@example.com';

        currentUserState.isLoggedIn = true;
        currentUserState.name = fullName;
        currentUserState.email = email;

        updateHeaderUserUI();
        closeRegisterModal();
        alert('🎉 Üyeliğiniz başarıyla oluşturuldu! Hoş geldiniz ' + fullName + '.');
    }

    function openProfileModal() {
        const modal = document.getElementById('profileModalOverlay');
        const userModal = document.getElementById('userModal');
        if (userModal) userModal.classList.remove('show');
        if (modal) modal.classList.add('show');

        const favCount = document.getElementById('profileFavCount');
        if (favCount) favCount.textContent = favoriteIds.size;
    }

    function closeProfileModal() {
        const modal = document.getElementById('profileModalOverlay');
        if (modal) modal.classList.remove('show');
    }

    function saveProfileChanges() {
        const newName = document.getElementById('profileInputName')?.value;
        const newEmail = document.getElementById('profileInputEmail')?.value;

        if (newName) currentUserState.name = newName;
        if (newEmail) currentUserState.email = newEmail;

        updateHeaderUserUI();
        closeProfileModal();
        alert('✅ Profil bilgileriniz başarıyla güncellendi.');
    }

    function logoutUser() {
        currentUserState.isLoggedIn = false;
        updateHeaderUserUI();
        const userModal = document.getElementById('userModal');
        if (userModal) userModal.classList.remove('show');
        alert('👋 Oturumunuz kapatıldı. Tekrar görüşmek üzere!');
    }

    function openHostModal() {
        const userModal = document.getElementById('userModal');
        if (userModal) userModal.classList.remove('show');
        alert('🏡 Ev Sahibi Paneli: New York\'taki evinizi kiraya vermek için başvuru formu açılıyor...');
    }

    // ── AI SMART ASSISTANT MODULE ──
    /* ---- AI NAVBAR DROPDOWN ---- */
    function toggleAiDropdown(e) {
        if (e) e.stopPropagation();
        const panel = document.getElementById('aiDropdownPanel');
        const pill  = document.getElementById('aiNavPill');
        if (!panel) return;
        const isOpen = panel.classList.toggle('open');
        // Dynamically position panel below the pill button
        if (pill) {
            const rect = pill.getBoundingClientRect();
            panel.style.top   = (rect.bottom + 8) + 'px';
            panel.style.right = (window.innerWidth - rect.right) + 'px';
            panel.style.left  = 'auto';
            // Toggle active ring on pill
            if (isOpen) pill.classList.add('active');
            else        pill.classList.remove('active');
        }
    }

    function sendAiDropPrompt(promptText) {
        const chatBody = document.getElementById('aiDropChatBody');
        const welcome  = document.getElementById('aiDropWelcome');
        const footer   = document.getElementById('aiDropFooter');
        if (!chatBody) return;

        if (welcome) welcome.style.display = 'none';
        chatBody.style.display = 'flex';
        if (footer) footer.style.display = 'flex';
        chatBody.innerHTML = '';

        // Question bubble
        chatBody.insertAdjacentHTML('beforeend',
            `<div class="ai-question-bubble">${escapeHtml(promptText)}</div>`);

        // Typing dots
        const typingId = 'dtip_' + Date.now();
        chatBody.insertAdjacentHTML('beforeend',
            `<div id="${typingId}" class="ai-answer-bubble" style="padding:0.75rem 1rem;">
                <div class="ai-typing-dots"><span></span><span></span><span></span></div>
            </div>`);
        chatBody.scrollTop = chatBody.scrollHeight;

        setTimeout(() => {
            const el = document.getElementById(typingId);
            if (el) el.remove();
            const resp = processAiQuery(promptText);
            chatBody.insertAdjacentHTML('beforeend',
                `<div class="ai-answer-bubble">
                    <div class="ai-answer-label"><i class="fa-solid fa-brain"></i> NYC Rental AI</div>
                    ${resp}
                </div>`);
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 700);
    }

    function resetAiDropdown() {
        const chatBody = document.getElementById('aiDropChatBody');
        const welcome  = document.getElementById('aiDropWelcome');
        const footer   = document.getElementById('aiDropFooter');
        if (chatBody) { chatBody.innerHTML = ''; chatBody.style.display = 'none'; }
        if (welcome) welcome.style.display = 'block';
        if (footer) footer.style.display = 'none';
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const wrap  = document.getElementById('aiNavWrap');
        const panel = document.getElementById('aiDropdownPanel');
        const pill  = document.getElementById('aiNavPill');
        if (wrap && panel && panel.classList.contains('open') && !wrap.contains(e.target) && !panel.contains(e.target)) {
            panel.classList.remove('open');
            if (pill) pill.classList.remove('active');
        }
    });

    function openAiModal() {
        const modal = document.getElementById('aiModalOverlay');
        if (modal) modal.classList.add('show');
    }

    function closeAiModal() {
        const modal = document.getElementById('aiModalOverlay');
        if (modal) modal.classList.remove('show');
    }

    function resetAiModal() {
        const chatBody = document.getElementById('aiChatBody');
        const welcomeArea = document.getElementById('aiWelcomeArea');
        const footer = document.getElementById('aiPanelFooter');
        if (chatBody) { chatBody.innerHTML = ''; chatBody.style.display = 'none'; }
        if (welcomeArea) welcomeArea.style.display = 'block';
        if (footer) footer.style.display = 'none';
    }

    function sendAiQuickPrompt(promptText) {
        const chatBody = document.getElementById('aiChatBody');
        const welcomeArea = document.getElementById('aiWelcomeArea');
        const footer = document.getElementById('aiPanelFooter');
        if (!chatBody) return;

        // Switch from welcome screen to chat panel
        if (welcomeArea) welcomeArea.style.display = 'none';
        chatBody.style.display = 'flex';
        if (footer) footer.style.display = 'flex';
        chatBody.innerHTML = '';

        // Show question bubble
        const qBubble = `<div class="ai-question-bubble">${escapeHtml(promptText)}</div>`;
        chatBody.insertAdjacentHTML('beforeend', qBubble);

        // Show typing indicator
        const typingId = 'typing_' + Date.now();
        const typingHtml = `
            <div id="${typingId}" class="ai-answer-bubble" style="padding:0.75rem 1rem;">
                <div class="ai-typing-dots"><span></span><span></span><span></span></div>
            </div>`;
        chatBody.insertAdjacentHTML('beforeend', typingHtml);
        chatBody.scrollTop = chatBody.scrollHeight;

        // Process and show answer
        setTimeout(() => {
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            const botResponse = processAiQuery(promptText);
            const answerHtml = `
                <div class="ai-answer-bubble">
                    <div class="ai-answer-label"><i class="fa-solid fa-brain"></i> NYC Rental AI</div>
                    ${botResponse}
                </div>`;
            chatBody.insertAdjacentHTML('beforeend', answerHtml);
            chatBody.scrollTop = chatBody.scrollHeight;
        }, 700);
    }

    function submitAiQuery() {
        // Legacy function - kept for compatibility
    }

    function processAiQuery(query) {
        const q = query.toLowerCase();

        // Query Pattern 1: Brooklyn ortalama altı evler
        if (q.includes('brooklyn') && (q.includes('ortalama') || q.includes('alt') || q.includes('ucuz') || q.includes('fiyat'))) {
            const bSelect = document.getElementById('boroughSelect');
            const maxPriceInput = document.getElementById('maxPriceInput');
            if (bSelect) bSelect.value = 'Brooklyn';
            if (maxPriceInput) maxPriceInput.value = '124';
            fetchData();

            return `
                🎯 <strong>Brooklyn Bölge Analizi & Filtrelemesi:</strong><br><br>
                Brooklyn genelindeki gecelik ortalama kiralama fiyatı <strong>$124</strong> seviyesindedir.<br>
                Veritabanımızdaki Brooklyn evlerinden ortalamanın altında kalan <strong>(Ort. $82 / gece)</strong> bütçe dostu ilanlar filtrelendi ve harita üzerinde aktif edildi!<br><br>
                <div class="ai-stat-card-mini">
                    📍 <strong>Bölge:</strong> Brooklyn, NYC<br>
                    💰 <strong>Uygulanan Tavan Fiyat:</strong> $124 / gece<br>
                    🏠 <strong>Durum:</strong> Filtrelenen Evler Ana Sayfada Listelendi ✨
                </div>
            `;
        }

        // Query Pattern 2: Yatırım için en uygun mahalle
        if (q.includes('yatırım') || q.includes('uygun mahalle') || q.includes('getiri') || q.includes('kazanç')) {
            return `
                📈 <strong>NYC Gayrimenkul Yatırım & Kiralama Analiz Raporu:</strong><br><br>
                Doluluk oranları, gecelik kiralama fiyatları ve müşteri yorum hacimlerine göre yatırım için <strong>Top 3 Mahalle:</strong><br><br>
                🥇 <strong>1. Williamsburg (Brooklyn):</strong> %88 Doluluk, Ort. $143/gece, 3.920 Aktif İlan. Yüksek turizm ve kültür talebi.<br>
                🥈 <strong>2. Bedford-Stuyvesant (Brooklyn):</strong> Ort. $95/gece, Hızla yükselen kiralama değeri ve düşük ilk yatırım maliyeti.<br>
                🥉 <strong>3. Harlem (Manhattan):</strong> Ort. $118/gece, Manhattan'ın en yüksek fiyat/performans kiralama potansiyeli.<br><br>
                <em>İpucu: Sayfadaki 'Keşfet' sekmesinden semt rehberlerini detaylıca inceleyebilirsiniz.</em>
            `;
        }

        // Query Pattern 3: Manhattan en yüksek puanlı / lüks
        if (q.includes('manhattan') && (q.includes('puan') || q.includes('lüks') || q.includes('en iyi') || q.includes('kaliteli'))) {
            const bSelect = document.getElementById('boroughSelect');
            if (bSelect) bSelect.value = 'Manhattan';
            const sortSelect = document.getElementById('sortSelect');
            if (sortSelect) sortSelect.value = 'rating_desc';
            fetchData();

            return `
                ⭐ <strong>Manhattan En Yüksek Puanlı Evler:</strong><br><br>
                Manhattan bölgesindeki 4.80+ puana sahip en yüksek müşteri memnuniyetli konaklama yerleri listelendi. Ort. gecelik fiyat <strong>$196</strong> seviyesindedir.<br><br>
                Sonuçlar sıralama filtresine 'En Yüksek Puanlı' olarak işlendi.
            `;
        }

        // Query Pattern 4: 100$ altı / ucuz yerler / bütçe
        if (q.includes('100') || q.includes('ucuz') || q.includes('bütçe')) {
            const maxPriceInput = document.getElementById('maxPriceInput');
            if (maxPriceInput) maxPriceInput.value = '100';
            fetchData();

            return `
                💰 <strong>Bütçe Dostu Konaklama Filtresi:</strong><br><br>
                Geceliği <strong>$100 ve altındaki</strong> konaklama seçenekleri harita ve listede aktif edildi. Veritabanında $100 altında 18.200'den fazla ev yer almaktadır.
            `;
        }

        // Query Pattern 5: Default General Analytics Response
        return `
            🔍 <strong>NYC Rental Veri Analizi:</strong><br><br>
            Sorgunuz işlendi! Veritabanımızda <strong>48.895 aktif konaklama seçeneği</strong> yer alıyor. Genel istatistikler:<br>
            • 🌆 <strong>En Yüksek Fiyatlı Bölge:</strong> Manhattan ($196 / gece)<br>
            • 🏠 <strong>En Çok İlan Bulunan Bölge:</strong> Brooklyn (20.104 Ev)<br>
            • 🏷️ <strong>Genel Şehir Ortalaması:</strong> $152 / gece<br><br>
            Belli bir bölge, fiyat veya yatırım sorusu sormak için yukarıdaki hazır butonlara tıklayabilir veya sorunuzu yazabilirsiniz!
        `;
    }

    // Public API Methods Exposed to Window
    return {
        fetchData: fetchData,
        toggleTheme: toggleTheme,
        toggleNotifications: toggleNotifications,
        toggleUserMenu: toggleUserMenu,
        toggleSidebarPanel: toggleSidebarPanel,
        toggleNavFilters: toggleNavFilters,
        toggleFavoritesDrawer: toggleFavoritesDrawer,
        toggleFavorite: toggleFavorite,
        toggleMapTileLayer: toggleMapTileLayer,
        toggleMapExpand: toggleMapExpand,
        selectPropertyById: selectPropertyById,
        closeMapPopup: closeMapPopup,
        openDetailModal: openDetailModal,
        closeDetailModal: closeDetailModal,
        openSimilarListing: openSimilarListing,
        toggleDetailFav: toggleDetailFav,
        openBookingModal: openBookingModal,
        closeBookingModal: closeBookingModal,
        calculateBookingTotal: calculateBookingTotal,
        goToBookingStep: goToBookingStep,
        submitBooking: submitBooking,
        switchTab: switchTab,
        updatePriceLabel: updatePriceLabel,
        updateReviewsLabel: updateReviewsLabel,
        toggleAllRoomTypes: toggleAllRoomTypes,
        onRoomTypeChange: onRoomTypeChange,
        clearFilters: clearFilters,
        filterByBoroughFromExplore: filterByBoroughFromExplore,
        openBoroughModal: openBoroughModal,
        clearBoroughFilterModal: applyBoroughFilterFromModal,
        clearAllFavorites: clearAllFavorites,
        renderFavoritesPage: renderFavoritesPage,
        openLoginModal: openLoginModal,
        closeLoginModal: closeLoginModal,
        submitLogin: submitLogin,
        quickSocialLogin: quickSocialLogin,
        openRegisterModal: openRegisterModal,
        closeRegisterModal: closeRegisterModal,
        submitRegister: submitRegister,
        openProfileModal: openProfileModal,
        closeProfileModal: closeProfileModal,
        saveProfileChanges: saveProfileChanges,
        logoutUser: logoutUser,
        openHostModal: openHostModal,
        openAiModal: openAiModal,
        closeAiModal: closeAiModal,
        resetAiModal: resetAiModal,
        sendAiQuickPrompt: sendAiQuickPrompt,
        submitAiQuery: submitAiQuery,
        toggleAiDropdown: toggleAiDropdown,
        sendAiDropPrompt: sendAiDropPrompt,
        resetAiDropdown: resetAiDropdown,
        renderComparePage: renderComparePage,
        clearFieldError: clearFieldError,
        updateGuestCount: updateGuestCount
    };

})();
