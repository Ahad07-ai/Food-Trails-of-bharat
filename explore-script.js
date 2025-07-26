// explore-script.js
document.addEventListener('DOMContentLoaded', () => {
    // Configuration and Constants
    const CONFIG = {
        GROQ_API_KEY: "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",
        GROQ_MODEL: "llama3-8b-8192",
        GROQ_URL: "https://api.groq.com/openai/v1/chat/completions",
        CHAT_STORAGE_KEY: 'streetFoodChat',
        FAVORITES_STORAGE_KEY: 'favoriteVendors',
        IMAGE_ANALYSIS_API: 'http://127.0.0.1:5000/analyze-image', // Use 127.0.0.1 for local reliability
        SEARCH_HISTORY_KEY: 'searchHistory' // New: For storing recent searches
    };

    let allVendorsData = [];
    let displayedVendors = [];
    const VENDORS_PER_PAGE = 12;
    let currentPage = 1;
    let chatHistory = [];
    let userLocation = null; // To store user's geolocation
    let suggestionsArray = []; // New: For autocomplete suggestions
    let popularSearches = ['Pani Puri', 'Vada Pav', 'Biryani', 'Chaat', 'Dosa', 'Mumbai', 'Delhi', 'Street Food']; // New: Predefined popular terms

    const vendorMap = L.map('vendorMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(vendorMap);
    let vendorMarkersLayer = L.layerGroup().addTo(vendorMap);

    // DOM Elements
    const allVendorsGrid = document.getElementById('allVendors');
    const popularVendorsGrid = document.getElementById('popularVendors');
    const recommendedVendorsGrid = document.getElementById('recommendedVendors');
    const trendingCarousel = document.getElementById('trendingCarousel');
    const foodSpotlightDiv = document.getElementById('foodSpotlight');
    const loadMoreBtn = document.getElementById('loadMoreVendors');
    const vendorSearchInput = document.getElementById('vendorSearch');
    const cityFilter = document.getElementById('cityFilter');
    const cuisineFilter = document.getElementById('cuisineFilter');
    const priceFilter = document.getElementById('priceFilter');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const clearFiltersBtn = document.getElementById('clearFilters'); // New: Clear filters button
    const sortFilter = document.getElementById('sortFilter'); // New: Sort dropdown
    const vendorCount = document.getElementById('vendorCount'); // New: Vendor count display
    const favoritesGrid = document.getElementById('favoritesGrid'); // New: Favorites section grid

    // Modal elements
    const modal = document.getElementById('vendorModal');
    const modalBody = document.getElementById('modalBody');
    const closeModalBtn = document.querySelector('.close-modal-btn');

    // Chatbot elements
    const chatbotContainer = document.getElementById('chatbotContainer');
    const chatbotToggle = document.getElementById('chatbotToggle');
    const closeChatbotBtn = document.getElementById('closeChatbot');
    const chatbotMessages = document.getElementById('chatbotMessages');
    const chatbotUserInput = document.getElementById('chatbotUserInput');
    const sendChatbotMessageBtn = document.getElementById('sendChatbotMessage');

    // Dark Mode Toggle
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const sunIcon = darkModeToggle?.querySelector('.sun-icon');
    const moonIcon = darkModeToggle?.querySelector('.moon-icon');

    // Scroll to Top Button
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    // Suggest Vendor Form
    const suggestVendorForm = document.getElementById('suggestVendorForm');
    const suggestionStatus = document.getElementById('suggestionStatus');

    // Utility Functions
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function createElement(tag, className, innerHTML) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    function getCurrentTimeStatus(openTime, closeTime) {
        if (!openTime || !closeTime) return { text: 'Timings N/A', class: 'closed' };
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const [openHour, openMinute] = openTime.split(':').map(Number);
        const [closeHour, closeMinute] = closeTime.split(':').map(Number);

        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const openTimeInMinutes = openHour * 60 + openMinute;
        let closeTimeInMinutes = closeHour * 60 + closeMinute;

        if (closeTimeInMinutes < openTimeInMinutes) {
            closeTimeInMinutes += 24 * 60;
        }

        if (currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes) {
            return { text: 'Open', class: 'open' };
        } else {
            return { text: 'Closed', class: 'closed' };
        }
    }

    // New: Haversine formula for distance calculation
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    function createVendorCard(vendor, isFavoriteSection = false) {
        const card = document.createElement('div');
        card.classList.add('vendor-card');
        card.dataset.vendorId = vendor.id;

        const status = getCurrentTimeStatus(vendor.timings?.open, vendor.timings?.close);

        // New: Highlight matching search term in specialties
        const searchTerm = vendorSearchInput.value.toLowerCase().trim();
        let specialtiesHtml = (vendor.specialties || []).join(', ');
        if (searchTerm && specialtiesHtml.toLowerCase().includes(searchTerm)) {
            specialtiesHtml = specialtiesHtml.replace(new RegExp(searchTerm, 'gi'), (match) => `<strong>${match}</strong>`);
        }

        // New: Add favorite heart icon
        const favorites = getFavorites();
        const isFavorite = favorites.includes(vendor.id);
        const heartIcon = isFavorite ? '❤️' : '🤍'; // Filled or empty heart

        card.innerHTML = `
            <img src="${vendor.image || 'https://via.placeholder.com/300x180?text=No+Image'}" alt="${vendor.name}" class="vendor-card-image">
            <div class="vendor-card-content">
                <div>
                    <h3>${vendor.name}</h3>
                    <p class="vendor-card-info">${vendor.area}, ${vendor.city}</p>
                    <p class="vendor-card-info">Cuisine: ${vendor.cuisine.join(', ')}</p>
                    <p class="vendor-card-info">Specialties: ${specialtiesHtml}</p> <!-- Updated: Highlighted specialties -->
                </div>
                <div class="vendor-rating-price">
                    <span class="vendor-rating"><span class="star">★</span> ${vendor.rating.toFixed(1)}</span>
                    <span class="vendor-price-range">${vendor.priceRange}</span>
                </div>
                 <span class="live-status ${status.class}">${status.text}</span>
            </div>
            <span class="favorite-heart" data-vendor-id="${vendor.id}">${heartIcon}</span>
        `;
        card.addEventListener('click', () => openVendorModal(vendor.id));

        // New: Favorite toggle event (only if not in favorites section to avoid confusion)
        if (!isFavoriteSection) {
            const heart = card.querySelector('.favorite-heart');
            heart.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent modal open
                toggleFavorite(vendor.id);
                renderFavorites(); // Update favorites section
                // Re-render the current card to update heart
                const updatedCard = createVendorCard(vendor);
                card.parentNode.replaceChild(updatedCard, card);
            });
        }

        return card;
    }

    function renderVendors(vendorsToRender, gridElement) {
        if (!gridElement || !Array.isArray(vendorsToRender)) {
            console.error('Invalid parameters for renderVendors:', { vendorsToRender, gridElement });
            return;
        }
        gridElement.innerHTML = '';
        if (vendorsToRender.length === 0) {
            gridElement.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <h3>No matching vendors found</h3>
                    <p>Try searching for popular items like: ${popularSearches.slice(0, 3).join(', ')} or clear filters.</p>
                </div>
            `;
        } else {
            vendorsToRender.forEach(vendor => {
                gridElement.appendChild(createVendorCard(vendor));
            });
        }
    }

    function displayPaginatedVendors() {
        if (!Array.isArray(displayedVendors)) {
            console.error('displayedVendors is not an array:', displayedVendors);
            return;
        }

        const start = (currentPage - 1) * VENDORS_PER_PAGE;
        const end = start + VENDORS_PER_PAGE;
        const paginatedItems = displayedVendors.slice(start, end);

        paginatedItems.forEach(vendor => {
            allVendorsGrid.appendChild(createVendorCard(vendor));
        });

        if (loadMoreBtn) {
            loadMoreBtn.style.display = end < displayedVendors.length ? 'block' : 'none';
        }
    }

    function populateFilters() {
        if (!Array.isArray(allVendorsData) || allVendorsData.length === 0) {
            console.error('Cannot populate filters: allVendorsData is not a valid array');
            return;
        }

        const cities = [...new Set(allVendorsData.map(v => v.city))].sort();
        const cuisines = [...new Set(allVendorsData.flatMap(v => v.cuisine || []))].sort();

        cityFilter.innerHTML = '<option value="">All Cities</option>';
        cuisineFilter.innerHTML = '<option value="">All Cuisines</option>';

        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            cityFilter.appendChild(option);
        });

        cuisines.forEach(cuisine => {
            const option = document.createElement('option');
            option.value = cuisine;
            option.textContent = cuisine;
            cuisineFilter.appendChild(option);
        });

        // New: Add "Relevance" to sort options
        if (sortFilter) {
            const relevanceOption = document.createElement('option');
            relevanceOption.value = 'relevance';
            relevanceOption.textContent = 'Relevance';
            sortFilter.appendChild(relevanceOption);
        }
    }

    // New: Generate suggestions for autocomplete
   // New: Generate suggestions for autocomplete
function generateSuggestions() {
    console.log('Generating suggestions from vendors data...');
    if (!allVendorsData || allVendorsData.length === 0) {
        console.warn('No vendor data available for suggestions. Ensure vendors.json is loaded.');
        suggestionsArray = popularSearches; // Fallback to popular searches
        return;
    }
    const suggestions = new Set(popularSearches); // Start with popular searches
    allVendorsData.forEach(v => {
        suggestions.add(v.name);
        (v.cuisine || []).forEach(c => suggestions.add(c));
        (v.specialties || []).forEach(s => suggestions.add(s));
        (v.tags || []).forEach(t => suggestions.add(t));
        (v.trending || []).forEach(t => suggestions.add(t)); // New: Include trending for food
        suggestions.add(v.city);
        suggestions.add(v.area);
    });
    suggestionsArray = Array.from(suggestions).sort();
    console.log('Suggestions generated:', suggestionsArray.length, 'items');
}
    // New: Get recent searches from localStorage
    function getSearchHistory() {
        const saved = localStorage.getItem(CONFIG.SEARCH_HISTORY_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    // New: Save search term to history
    function saveSearchHistory(term) {
        if (!term) return;
        let history = getSearchHistory();
        history = [term, ...history.filter(t => t !== term)].slice(0, 5); // Keep top 5 unique
        localStorage.setItem(CONFIG.SEARCH_HISTORY_KEY, JSON.stringify(history));
    }

    // New: Show autocomplete suggestions
    // New: Show autocomplete suggestions
// New: Show autocomplete suggestions
function showSuggestions() {
    console.log('showSuggestions triggered. Current input:', vendorSearchInput.value);
    const term = vendorSearchInput.value.toLowerCase().trim();
    let matches = [];

    if (term.length < 2) {
        // Show popular/recent when input is short or empty
        const history = getSearchHistory();
        matches = [...history, ...popularSearches.filter(p => !history.includes(p))].slice(0, 10);
        console.log('Showing popular/recent suggestions:', matches);
    } else {
        matches = suggestionsArray.filter(s => s.toLowerCase().includes(term)).slice(0, 10);
        console.log('Filtered matches for term "' + term + '":', matches);
    }

    // Find or create the suggestions div
    let suggestionsDiv = document.getElementById('searchSuggestions');
    if (!suggestionsDiv) {
        console.log('Creating new suggestions dropdown...');
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'searchSuggestions';
        suggestionsDiv.className = 'suggestions-dropdown';
        // Append to the search container (assuming .search-bar-container is the parent)
        const searchContainer = document.querySelector('.search-bar-container');
        if (searchContainer) {
            searchContainer.appendChild(suggestionsDiv);
        } else {
            console.warn('Search container not found. Appending to input parent instead.');
            vendorSearchInput.parentNode.appendChild(suggestionsDiv);
        }
    } else {
        console.log('Using existing suggestions dropdown.');
    }

    suggestionsDiv.innerHTML = '';
    if (matches.length === 0) {
        suggestionsDiv.innerHTML = '<div class="suggestion-item">No suggestions</div>';
    } else {
        matches.forEach(match => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = match;
            item.addEventListener('click', () => {
                console.log('Suggestion clicked:', match);
                vendorSearchInput.value = match;
                saveSearchHistory(match); // Save to history
                hideSuggestions();
                filterAndSearchVendors();
                // New: Scroll to the all vendors section to directly show results
                const allVendorsSection = document.querySelector('.all-vendors-section');
                if (allVendorsSection) {
                    allVendorsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
            suggestionsDiv.appendChild(item);
        });
    }
    suggestionsDiv.style.display = 'block';
    console.log('Dropdown displayed with', matches.length, 'items');
}
    // New: Hide suggestions
    function hideSuggestions() {
        const suggestionsDiv = document.getElementById('searchSuggestions');
        if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    }

    function filterAndSearchVendors() {
        if (!Array.isArray(allVendorsData)) {
            console.error('Cannot filter: allVendorsData is not an array');
            return;
        }

        const searchTerm = vendorSearchInput.value.toLowerCase();
        saveSearchHistory(searchTerm); // New: Save search to history

        const selectedCity = cityFilter.value;
        const selectedCuisine = cuisineFilter.value;
        const selectedPrice = priceFilter.value;
        const selectedSort = sortFilter ? sortFilter.value : ''; // New: Get sort option

        displayedVendors = allVendorsData.filter(vendor => {
            const matchesSearch = vendor.name.toLowerCase().includes(searchTerm) ||
                (vendor.cuisine || []).join(' ').toLowerCase().includes(searchTerm) ||
                (vendor.specialties || []).join(' ').toLowerCase().includes(searchTerm) ||
                (vendor.tags || []).join(' ').toLowerCase().includes(searchTerm) ||
                (vendor.trending || []).join(' ').toLowerCase().includes(searchTerm) || // New: Search in trending for food
                vendor.city.toLowerCase().includes(searchTerm) ||
                vendor.area.toLowerCase().includes(searchTerm);
            const matchesCity = !selectedCity || vendor.city === selectedCity;
            const matchesCuisine = !selectedCuisine || (vendor.cuisine || []).includes(selectedCuisine);
            const matchesPrice = !selectedPrice || vendor.priceRange === selectedPrice;

            return matchesSearch && matchesCity && matchesCuisine && matchesPrice;
        });

        // New: Sort the displayed vendors (added 'relevance')
        if (selectedSort) {
            displayedVendors.sort((a, b) => {
                if (selectedSort === 'relevance') {
                    // Prioritize exact matches in specialties/food
                    const scoreA = (a.specialties || []).some(s => s.toLowerCase() === searchTerm) ? 2 :
                        (a.specialties || []).some(s => s.toLowerCase().includes(searchTerm)) ? 1 : 0;
                    const scoreB = (b.specialties || []).some(s => s.toLowerCase() === searchTerm) ? 2 :
                        (b.specialties || []).some(s => s.toLowerCase().includes(searchTerm)) ? 1 : 0;
                    return scoreB - scoreA; // Higher score first
                }
                if (selectedSort === 'rating-desc') return b.rating - a.rating;
                if (selectedSort === 'rating-asc') return a.rating - b.rating;
                if (selectedSort === 'price-asc') return a.priceRange.length - b.priceRange.length; // Assuming more $ means higher price
                if (selectedSort === 'price-desc') return b.priceRange.length - a.priceRange.length;
                if (selectedSort === 'name-asc') return a.name.localeCompare(b.name);
                if (selectedSort === 'name-desc') return b.name.localeCompare(a.name);
                if (selectedSort === 'nearby') {
                    if (!userLocation) return 0; // No location, no sort
                    const distA = a.coordinates ? calculateDistance(userLocation.lat, userLocation.lng, a.coordinates[0], a.coordinates[1]) : Infinity;
                    const distB = b.coordinates ? calculateDistance(userLocation.lat, userLocation.lng, b.coordinates[0], b.coordinates[1]) : Infinity;
                    return distA - distB;
                }
                return 0;
            });
        }

        allVendorsGrid.innerHTML = '';
        currentPage = 1;
        displayPaginatedVendors();
        updateMapMarkers(displayedVendors);

        // New: Update vendor count
        if (vendorCount) {
            vendorCount.textContent = `Showing ${displayedVendors.length} vendors`;
        }
    }

    function addVendorMarkersToMap(vendors) {
        if (!Array.isArray(vendors)) {
            console.error('Cannot add markers: vendors is not an array');
            return;
        }

        vendorMarkersLayer.clearLayers();

        vendors.forEach(vendor => {
            if (vendor.coordinates && Array.isArray(vendor.coordinates) && vendor.coordinates.length === 2) {
                // New: Highlight nearby vendors (e.g., within 50km) with different icon/color
                let markerOptions = {};
                if (userLocation) {
                    const distance = calculateDistance(userLocation.lat, userLocation.lng, vendor.coordinates[0], vendor.coordinates[1]);
                    if (distance < 50) { // Arbitrary threshold for "nearby"
                        markerOptions = { icon: L.icon({ iconUrl: 'path/to/red-marker.png', iconSize: [25, 41] }) }; // Assume a custom icon
                    }
                }
                const marker = L.marker(vendor.coordinates, markerOptions)
                    .bindPopup(`<b>${vendor.name}</b><br>${vendor.area}, ${vendor.city}<br><button class="map-popup-btn" data-id="${vendor.id}">Details</button>`);
                vendorMarkersLayer.addLayer(marker);
            }
        });

        try {
            const layers = vendorMarkersLayer.getLayers();
            if (layers.length > 0) {
                const group = new L.featureGroup(layers);
                vendorMap.fitBounds(group.getBounds().pad(0.1));
            } else if (vendors.length === 0) {
                vendorMap.setView([20.5937, 78.9629], 5);
            }
        } catch (error) {
            console.warn('Error fitting map bounds:', error);
            vendorMap.setView([20.5937, 78.9629], 5);
        }
    }

    function updateMapMarkers(vendors) {
        addVendorMarkersToMap(vendors);
    }

    // New: Favorites Management
    function getFavorites() {
        const saved = localStorage.getItem(CONFIG.FAVORITES_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    }

    function toggleFavorite(vendorId) {
        let favorites = getFavorites();
        if (favorites.includes(vendorId)) {
            favorites = favorites.filter(id => id !== vendorId);
        } else {
            favorites.push(vendorId);
        }
        localStorage.setItem(CONFIG.FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        renderFavorites();
    }

    function renderFavorites() {
        if (!favoritesGrid) return;
        const favorites = getFavorites();
        const favoriteVendors = allVendorsData.filter(v => favorites.includes(v.id));
        favoritesGrid.innerHTML = '';
        if (favoriteVendors.length === 0) {
            favoritesGrid.innerHTML = '<p>No favorites yet!</p>';
        } else {
            renderVendors(favoriteVendors, favoritesGrid);
        }
    }

    // New: Get user location (called once on init)
    function getUserLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                    console.log('User location obtained:', userLocation);
                    filterAndSearchVendors(); // Re-filter to apply nearby sort if selected
                    updateMapMarkers(displayedVendors); // Update highlights
                },
                (error) => {
                    console.warn('Geolocation error:', error);
                    // Optional: Show a message to user
                }
            );
        } else {
            console.warn('Geolocation not supported');
        }
    }

    // --- Modal Functionality ---
    function openVendorModal(vendorId) {
        const vendor = allVendorsData.find(v => v.id == vendorId);
        if (!vendor) {
            console.error('Vendor not found:', vendorId);
            return;
        }

        let galleryHtml = '';
        if (vendor.gallery && Array.isArray(vendor.gallery) && vendor.gallery.length > 0) {
            galleryHtml = vendor.gallery.map(imgUrl => `<img src="${imgUrl}" alt="${vendor.name} image">`).join('');
        } else {
            galleryHtml = '<p>No images available.</p>';
        }

        let contactHtml = '';
        if (vendor.contact?.phone) contactHtml += `<p><strong>Phone:</strong> ${vendor.contact.phone}</p>`;
        if (vendor.contact?.instagram) contactHtml += `<p><strong>Instagram:</strong> <a href="https://instagram.com/${vendor.contact.instagram.replace('@','')}" target="_blank">${vendor.contact.instagram}</a></p>`;
        if (vendor.contact?.website) contactHtml += `<p><strong>Website:</strong> <a href="${vendor.contact.website}" target="_blank">${vendor.contact.website}</a></p>`;
        if (!contactHtml) contactHtml = '<p>No contact information available.</p>';

        const status = getCurrentTimeStatus(vendor.timings?.open, vendor.timings?.close);

        modalBody.innerHTML = `
            <h2>${vendor.name}</h2>
            <img src="${vendor.image || 'https://via.placeholder.com/600x300?text=No+Image'}" alt="${vendor.name}" style="width:100%; max-height: 300px; object-fit:cover; border-radius:8px; margin-bottom:15px;">
            <p><strong>Location:</strong> ${vendor.area}, ${vendor.city}</p>
            <p><strong>Cuisine:</strong> ${(vendor.cuisine || []).join(', ')}</p>
            <p><strong>Specialties:</strong> ${(vendor.specialties || []).join(', ')}</p>
            <p><strong>Rating:</strong> <span class="star">★</span> ${vendor.rating.toFixed(1)}</p>
            <p><strong>Price Range:</strong> ${vendor.priceRange}</p>
            <p><strong>Timings:</strong> ${vendor.timings?.open || 'N/A'} - ${vendor.timings?.close || 'N/A'} <span class="live-status ${status.class}" style="margin-left:10px;">${status.text}</span></p>
            
            <h3>Gallery</h3>
            <div class="modal-gallery">${galleryHtml}</div>

            <h3>Contact</h3>
            <div class="modal-contact">${contactHtml}</div>

            <div class="reviews-section-modal">
                <h3>Reviews & Ratings</h3>
                <p>Average Rating: <span class="star">★</span> ${vendor.rating.toFixed(1)} (Based on user reviews)</p>
            </div>
        `;
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // --- Enhanced AI Chatbot Functionality ---
    const AIChatbot = {
        init() {
            console.log('Initializing AI-powered Street Food chatbot...');
            this.bindEvents();
            this.loadChatHistory();
            this.addWelcomeMessage();
        },

        bindEvents() {
            if (chatbotToggle) {
                chatbotToggle.addEventListener('click', () => this.toggleChat(true));
            }

            if (closeChatbotBtn) {
                closeChatbotBtn.addEventListener('click', () => this.toggleChat(false));
            }

            if (sendChatbotMessageBtn) {
                sendChatbotMessageBtn.addEventListener('click', this.handleSend.bind(this));
            }

            if (chatbotUserInput) {
                chatbotUserInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.handleSend();
                    }
                });
            }

            // Close chat on Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && chatbotContainer?.classList.contains('chatbot-open')) {
                    this.toggleChat(false);
                }
            });

            // New: Image upload handling with debugging
            const imageUploadBtn = document.getElementById('imageUploadBtn');
            const imageInput = document.getElementById('imageInput');
            if (imageUploadBtn && imageInput) {
                console.log('Image upload elements found. Binding events...');
                imageUploadBtn.addEventListener('click', () => {
                    console.log('Image upload button clicked. Opening file dialog...');
                    imageInput.click();
                });
                imageInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        console.log('File selected:', file.name);
                        this.handleImageUpload(file);
                    } else {
                        console.log('No file selected.');
                    }
                });
            } else {
                console.error('Image upload elements not found! Check HTML IDs: imageUploadBtn and imageInput.');
            }
        },

        toggleChat(show) {
            if (!chatbotContainer) return;

            if (show) {
                chatbotContainer.classList.add('chatbot-open');
                if (chatbotUserInput) {
                    chatbotUserInput.focus();
                }
            } else {
                chatbotContainer.classList.remove('chatbot-open');
            }
        },

        addWelcomeMessage() {
            if (chatbotMessages && chatbotMessages.children.length === 0) {
                this.appendMessage('Welcome to Street Foods of Bharat! 🍛 I\'m your AI assistant. I can help you discover amazing Indian street food, find vendors, get recommendations, and answer questions about our delicious cuisine. How can I help you today?', 'bot');
            }
        },

        async handleSend() {
            const text = chatbotUserInput?.value.trim();
            if (!text) return;

            // Add user message
            this.appendMessage(text, 'user');
            chatHistory.push({ role: 'user', content: text });

            // Clear input and disable controls
            chatbotUserInput.value = '';
            chatbotUserInput.disabled = true;
            sendChatbotMessageBtn.disabled = true;

            // Show typing indicator
            const typingMsg = this.appendMessage('🤔 Thinking...', 'bot');
            if (typingMsg) {
                typingMsg.classList.add('typing-indicator');
            }

            try {
                const botReply = await this.chatWithGroq(chatHistory);

                // Remove typing indicator
                if (typingMsg) {
                    typingMsg.remove();
                }

                // Add bot response
                this.appendMessage(botReply, 'bot');
                chatHistory.push({ role: 'assistant', content: botReply });

                // Save chat history
                this.saveChatHistory();

                // Check if bot mentioned any vendors and highlight them
                this.highlightMentionedVendors(botReply);

            } catch (err) {
                console.error('Chatbot error:', err);

                // Remove typing indicator
                if (typingMsg) {
                    typingMsg.remove();
                }

                // Show error message
                let errorMessage = 'Sorry, I encountered an error. Please try again.';

                if (err.message.includes('API key not configured')) {
                    errorMessage = 'Please configure your Groq API key to use the AI chatbot feature.';
                } else if (err.message.includes('401')) {
                    errorMessage = 'Invalid API key. Please check your Groq API key configuration.';
                } else if (err.message.includes('429')) {
                    errorMessage = 'Too many requests. Please wait a moment and try again.';
                } else if (err.message.includes('network') || err.message.includes('fetch')) {
                    errorMessage = 'Network error. Please check your internet connection and try again.';
                }

                this.appendMessage(errorMessage, 'bot');

            } finally {
                // Re-enable controls
                chatbotUserInput.disabled = false;
                sendChatbotMessageBtn.disabled = false;
                chatbotUserInput.focus();
            }
        },

        async handleImageUpload(file) {
            if (!file) {
                console.log('No file provided for upload.');
                return;
            }

            console.log('Starting image upload analysis for file:', file.name);

            // Disable controls
            chatbotUserInput.disabled = true;
            sendChatbotMessageBtn.disabled = true;

            // Show typing indicator
            const typingMsg = this.appendMessage('🤔 Analyzing image...', 'bot');
            typingMsg.classList.add('typing-indicator');

            try {
                const formData = new FormData();
                formData.append('image', file);
                // Pass context (from existing vendor data and user location)
                const vendorContext = allVendorsData.length > 0 ?
                    `Available vendors: ${allVendorsData.map(v => `${v.name} (${v.city}) - ${v.cuisine.join(', ')}`).join('; ')}` :
                    'Vendor data is being loaded.';
                formData.append('vendor_context', vendorContext);
                if (userLocation) {
                    formData.append('user_location', JSON.stringify(userLocation));
                }
                formData.append('language', 'en');  // Or dynamically set based on user preference

                console.log('Sending fetch request to API:', CONFIG.IMAGE_ANALYSIS_API);

                const response = await fetch(CONFIG.IMAGE_ANALYSIS_API, {
                    method: 'POST',
                    body: formData
                });

                console.log('API response status:', response.status);

                if (!response.ok) {
                    throw new Error(`API error: ${response.status} - ${await response.text()}`);
                }

                const data = await response.json();
                if (data.error) {
                    throw new Error(data.error);
                }

                console.log('API success. Results:', data.results);

                // Remove typing
                typingMsg.remove();

                // Append results
                this.appendMessage(data.results, 'bot');

            } catch (err) {
                console.error('Image upload error:', err);
                typingMsg.remove();
                this.appendMessage(`Error analyzing image: ${err.message}. Please try again.`, 'bot');
            } finally {
                chatbotUserInput.disabled = false;
                sendChatbotMessageBtn.disabled = false;
                chatbotUserInput.focus();
                // Clear file input
                document.getElementById('imageInput').value = '';
                console.log('Image upload process completed.');
            }
        },

        appendMessage(content, role) {
            if (!chatbotMessages || !content) return null;

            const msg = createElement('div', `message ${role}-message`, content);
            chatbotMessages.appendChild(msg);
            chatbotMessages.scrollTop = chatbotMessages.scrollHeight;

            return msg;
        },

        async chatWithGroq(messages) {
            // Validate inputs
            if (!Array.isArray(messages) || messages.length === 0) {
                throw new Error('Invalid messages array');
            }

            // Check API key
            if (CONFIG.GROQ_API_KEY === "YOUR_GROQ_API_KEY") {
                throw new Error('API key not configured');
            }

            // Limit conversation history to prevent token overflow
            const limitedMessages = messages.slice(-10);

            // Create context about available vendors
            const vendorContext = allVendorsData.length > 0 ?
                `Available vendors: ${allVendorsData.map(v => `${v.name} (${v.city}) - ${v.cuisine.join(', ')}`).join('; ')}` :
                'Vendor data is being loaded.';

            const requestBody = {
                model: CONFIG.GROQ_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are a helpful AI assistant for "Street Foods of Bharat", a platform for discovering authentic Indian street food. Help users find vendors, learn about dishes, get food recommendations, and explore Indian street food culture. 
Context about available vendors and data: ${vendorContext}

Guidelines:

Keep responses concise and friendly

Focus on Indian street food and cuisine

Provide specific vendor recommendations when possible

Share interesting facts about Indian street food

Help with food preferences and dietary requirements

Be enthusiastic about Indian food culture

If asked about vendors, mention specific ones from our database when relevant`
                    },
                    ...limitedMessages
                ],
                max_tokens: 400,
                temperature: 0.7,
                top_p: 1,
                stop: null
            };

            console.log('Sending request to Groq API:', requestBody);

            const response = await fetch(CONFIG.GROQ_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Groq API error:', response.status, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('Groq API response:', data);

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('Invalid response format from Groq API');
            }

            return data.choices[0].message.content.trim();
        },

        highlightMentionedVendors(botReply) {
            // Check if bot mentioned any vendors and scroll to them
            allVendorsData.forEach(vendor => {
                if (botReply.toLowerCase().includes(vendor.name.toLowerCase())) {
                    const vendorCard = document.querySelector(`[data-vendor-id="${vendor.id}"]`);
                    if (vendorCard) {
                        setTimeout(() => {
                            vendorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            vendorCard.style.border = '2px solid var(--primary-color)';
                            setTimeout(() => vendorCard.style.border = '', 3000);
                        }, 1000);
                    }
                }
            });
        },

        saveChatHistory() {
            if (!chatbotMessages) return;

            try {
                const messages = Array.from(chatbotMessages.children).map(msg => ({
                    type: msg.classList.contains('user-message') ? 'user' : 'bot',
                    message: msg.textContent
                }));

                localStorage.setItem(CONFIG.CHAT_STORAGE_KEY, JSON.stringify(messages));
                console.log('Chat history saved:', messages.length, 'messages');
            } catch (error) {
                console.error('Error saving chat history:', error);
            }
        },

        loadChatHistory() {
            try {
                const savedChat = localStorage.getItem(CONFIG.CHAT_STORAGE_KEY);
                if (savedChat) {
                    const messages = JSON.parse(savedChat);

                    if (Array.isArray(messages) && messages.length > 0) {
                        // Clear any existing messages first
                        if (chatbotMessages) {
                            chatbotMessages.innerHTML = '';
                        }

                        messages.forEach(msg => {
                            if (msg.type && msg.message) {
                                this.appendMessage(msg.message, msg.type);
                            }
                        });
                        console.log('Chat history loaded:', messages.length, 'messages');
                        return; // Don't show welcome message if history exists
                    }
                }
            } catch (error) {
                console.error('Error loading chat history:', error);
                localStorage.removeItem(CONFIG.CHAT_STORAGE_KEY);
            }
        }
    };

    // --- Special Sections ---
    function populateTrendingCarousel(vendors) {
        if (!trendingCarousel || !Array.isArray(vendors)) {
            console.log('Trending carousel element not found or vendors not array');
            return;
        }

        trendingCarousel.innerHTML = '';
        let trendingItems = [];

        vendors.forEach(v => {
            if (v.trending && Array.isArray(v.trending) && v.trending.length > 0) {
                v.trending.forEach(dish => {
                    trendingItems.push({ vendor: v, dish: dish });
                });
            }
        });

        trendingItems = trendingItems.sort(() => 0.5 - Math.random()).slice(0, 10);

        trendingItems.forEach(item => {
            const div = document.createElement('div');
            div.classList.add('carousel-item');
            div.innerHTML = `
                <img src="${item.vendor.image || 'https://via.placeholder.com/280x150?text=Trending'}" alt="${item.dish}">
                <h3>${item.dish}</h3>
                <p>At ${item.vendor.name}, ${item.vendor.city}</p>
            `;
            div.addEventListener('click', () => openVendorModal(item.vendor.id));
            trendingCarousel.appendChild(div);
        });

        console.log('Trending carousel populated with', trendingItems.length, 'items');
    }

    function populateFoodSpotlight(vendors) {
        if (!foodSpotlightDiv || !Array.isArray(vendors)) {
            console.log('Food spotlight element not found or vendors not array');
            return;
        }

        const spotlightCandidates = vendors.filter(v => v.rating >= 4.5);
        if (spotlightCandidates.length === 0) {
            console.log('No spotlight candidates found');
            return;
        }

        const spotlightVendor = spotlightCandidates[Math.floor(Math.random() * spotlightCandidates.length)];
        const dish = (spotlightVendor.specialties && spotlightVendor.specialties.length > 0) ? spotlightVendor.specialties[Math.floor(Math.random() * spotlightVendor.specialties.length)] : "Delicious Food";

        foodSpotlightDiv.innerHTML = `
            <img src="${spotlightVendor.image || 'https://via.placeholder.com/150?text=Spotlight'}" alt="${dish}">
            <div class="food-spotlight-info">
                <h3>${dish}</h3>
                <p>A must-try at <strong>${spotlightVendor.name}</strong></p>
                <p>${spotlightVendor.area}, ${spotlightVendor.city}</p>
                <button class="btn-primary" onclick="document.dispatchEvent(new CustomEvent('openVendorModalById', { detail: ${spotlightVendor.id} }))">View Details</button>
            </div>
        `;

        console.log('Food spotlight populated with', spotlightVendor.name);
    }

    // --- Dark Mode ---
    function setDarkMode(isDark) {
        if (isDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('darkMode', 'enabled');
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'block';
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('darkMode', 'disabled');
            if (sunIcon) sunIcon.style.display = 'block';
            if (moonIcon) moonIcon.style.display = 'none';
        }
    }

    // --- Scroll to Top ---
    window.onscroll = function() {
        if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
            if (scrollToTopBtn) scrollToTopBtn.style.display = "flex";
        } else {
            if (scrollToTopBtn) scrollToTopBtn.style.display = "none";
        }
    };

    // --- Suggest Vendor ---
    function handleSuggestVendor(e) {
        e.preventDefault();
        const formData = new FormData(suggestVendorForm);
        const newSuggestion = {
            name: formData.get('vendorName'),
            city: formData.get('vendorCity'),
            area: formData.get('vendorArea'),
            specialties: formData.get('vendorSpecialties'),
            timestamp: new Date().toISOString()
        };

        let suggestions = JSON.parse(localStorage.getItem('vendorSuggestions')) || [];
        suggestions.push(newSuggestion);
        localStorage.setItem('vendorSuggestions', JSON.stringify(suggestions));

        suggestionStatus.textContent = "Thanks for your suggestion! We'll review it.";
        suggestionStatus.style.color = 'green';
        suggestVendorForm.reset();
        setTimeout(() => suggestionStatus.textContent = "", 5000);
    }

    // --- Initialization ---
   // --- Initialization ---
async function initializePage() {
    try {
        console.log('Starting to fetch vendor data...');

        // Fetch vendors data
        const vendorsResponse = await fetch('./vendors.json');
        if (!vendorsResponse.ok) {
            throw new Error(`HTTP error! status: ${vendorsResponse.status}`);
        }
        const vendorsData = await vendorsResponse.json();
        console.log('Vendors data loaded:', vendorsData);

        // Validate and set the data
        if (vendorsData && Array.isArray(vendorsData.vendors)) {
            allVendorsData = vendorsData.vendors;
            displayedVendors = [...allVendorsData];
            generateSuggestions(); // Generate autocomplete suggestions based on the loaded data
            console.log('Total vendors loaded:', allVendorsData.length);
        } else {
            throw new Error('Invalid vendors data structure');
        }

        // Populate sections step by step with error handling
        console.log('Populating filters...');
        populateFilters();
        
        console.log('Displaying paginated vendors...');
        displayPaginatedVendors();

        // Populate special sections with error handling
        console.log('Populating popular vendors...');
        const popularVendors = allVendorsData.filter(v => v.popular).sort((a,b) => b.rating - a.rating).slice(0, 6);
        renderVendors(popularVendors, popularVendorsGrid);
        
        console.log('Populating recommended vendors...');
        const recommendedVendors = allVendorsData.filter(v => v.recommended).sort((a,b) => b.rating - a.rating).slice(0, 6);
        renderVendors(recommendedVendors, recommendedVendorsGrid);
        
        console.log('Populating trending carousel...');
        populateTrendingCarousel(allVendorsData);
        
        console.log('Populating food spotlight...');
        populateFoodSpotlight(allVendorsData);

        // New: Render initial favorites
        renderFavorites();

        // New: Get user location
        getUserLocation();

        // Initialize AI Chatbot
        console.log('Initializing AI Chatbot...');
        AIChatbot.init();

        // Dark Mode check
        if (localStorage.getItem('darkMode') === 'enabled') {
            setDarkMode(true);
        } else {
            setDarkMode(false);
        }

        console.log('Page initialization completed successfully');
    } catch (error) {
        console.error("Failed to load data:", error);

        // Show user-friendly error message
        if (allVendorsGrid) {
            allVendorsGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                    <h3>Unable to load vendor data</h3>
                    <p>Please make sure you're running this from a local server.</p>
                    <p>Error: ${error.message}</p>
                    <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer;">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
}

    // Event listener for custom modal event
    document.addEventListener('openVendorModalById', (e) => openVendorModal(e.detail));

    // --- Event Listeners ---
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            currentPage++;
            displayPaginatedVendors();
        });
    }

    if (vendorSearchInput) {
        const debouncedSearch = debounce(filterAndSearchVendors, 300);
        vendorSearchInput.addEventListener('input', () => {
            showSuggestions();
            debouncedSearch();
        });
        vendorSearchInput.addEventListener('focus', showSuggestions); // Show popular/recent on focus
    }

    // New: Hide suggestions on click outside
   // --- Event Listeners ---
if (vendorSearchInput) {
    console.log('Binding events to search input...');
    const debouncedSearch = debounce(filterAndSearchVendors, 300);
    vendorSearchInput.addEventListener('input', () => {
        console.log('Input event fired.');
        showSuggestions();
        debouncedSearch();
    });
    vendorSearchInput.addEventListener('focus', () => {
        console.log('Focus event fired.');
        showSuggestions();
    });
} else {
    console.error('Search input (#vendorSearch) not found! Dropdown cannot be bound.');
}

// New: Hide suggestions on click outside
document.addEventListener('click', (e) => {
    const suggestionsDiv = document.getElementById('searchSuggestions');
    if (suggestionsDiv && !vendorSearchInput.contains(e.target) && !suggestionsDiv.contains(e.target)) {
        console.log('Click outside - hiding suggestions.');
        hideSuggestions();
    }
});

    // New: Clear filters button
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            vendorSearchInput.value = '';
            cityFilter.value = '';
            cuisineFilter.value = '';
            priceFilter.value = '';
            if (sortFilter) sortFilter.value = '';
            filterAndSearchVendors();
            hideSuggestions();
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeModal);
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });

    // Map popup button click
    vendorMap.on('popupopen', function (e) {
        const btn = e.popup._container.querySelector('.map-popup-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                const vendorId = parseInt(this.dataset.id);
                openVendorModal(vendorId);
            });
        }
    });

    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.hasAttribute('data-theme');
            setDarkMode(!isDark);
        });
    }

    if (scrollToTopBtn) {
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    if (suggestVendorForm) {
        suggestVendorForm.addEventListener('submit', handleSuggestVendor);
    }

    // Initialize the page
    initializePage();

});

// Theme Toggle (if you want to add this feature)
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    const body = document.body;

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('dark-theme');
        const isDarkMode = body.classList.contains('dark-theme');
        themeToggle.innerHTML = isDarkMode ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

        // Save theme preference
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
}