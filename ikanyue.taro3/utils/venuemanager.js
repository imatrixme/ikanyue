import Taro from '@tarojs/taro';
import { Api } from './apis';

const STORAGE_KEY = 'com.ikanyue.venue.current.v1';

function normalizeVenue(venue = {}) {
    const text = (value) => (typeof value === 'string' ? value.trim() : '');
    return {
        address: text(venue.address),
        bookable: venue.bookable === true,
        id: text(venue.id),
        intro: text(venue.intro),
        name: text(venue.name),
        openingHours: text(venue.openingHours),
        phone: text(venue.phone),
    };
}

// The remembered venue wins while it is still active; otherwise the first venue by admin sort order.
function pickVenue(venues = [], storedId = '') {
    return venues.find((venue) => venue.id === storedId) || venues[0] || null;
}

function storedVenueId() {
    try {
        return Taro.getStorageSync(STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

function rememberVenue(venueId) {
    try {
        Taro.setStorageSync(STORAGE_KEY, venueId);
    } catch {
        // Storage full or unavailable: the default venue is a safe fallback.
    }
}

// Loads active venues and resolves the current one. A failed request yields no venue,
// which callers treat as "show nothing, keep booking available".
async function loadVenues() {
    try {
        const result = await Api.listPublicVenues();
        const venues = (Array.isArray(result?.items) ? result.items : []).map(normalizeVenue).filter((venue) => venue.id && venue.name);
        return { current: pickVenue(venues, storedVenueId()), venues };
    } catch {
        return { current: null, venues: [] };
    }
}

function venueClosed(venue) {
    return Boolean(venue) && !venue.bookable;
}

function callVenue(venue) {
    if (!venue?.phone) return;
    Taro.makePhoneCall({ phoneNumber: venue.phone }).catch(() => {});
}

const VenueManager = { callVenue, loadVenues, rememberVenue, storedVenueId, venueClosed };

export { VenueManager, normalizeVenue, pickVenue };
