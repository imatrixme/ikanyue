import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VenueManager, normalizeVenue, pickVenue } from './venuemanager';

const storage = vi.hoisted(() => new Map());
const taroMock = vi.hoisted(() => ({
    getStorageSync: vi.fn((key) => storage.get(key) || ''),
    makePhoneCall: vi.fn(() => Promise.resolve()),
    setStorageSync: vi.fn((key, value) => storage.set(key, value)),
}));
const apiMock = vi.hoisted(() => ({ listPublicVenues: vi.fn() }));

vi.mock('@tarojs/taro', () => ({ default: taroMock }));
vi.mock('./apis', () => ({ Api: apiMock }));

const venues = [
    { id: 'a', name: '看乐艺术', bookable: true, phone: '18521301857', intro: ' 声乐 ' },
    { id: 'b', name: '看乐二店', bookable: false },
];

describe('VenueManager', () => {
    beforeEach(() => {
        storage.clear();
        vi.clearAllMocks();
    });

    it('normalizes venues and defaults missing fields', () => {
        expect(normalizeVenue({ id: 'a', name: '看乐', bookable: 'yes', intro: ' 声乐 ' })).toEqual({
            address: '', bookable: false, id: 'a', intro: '声乐', name: '看乐', openingHours: '', phone: '',
        });
    });

    it('picks the remembered venue, falling back to the first one', () => {
        expect(pickVenue(venues, 'b').id).toBe('b');
        expect(pickVenue(venues, 'gone').id).toBe('a');
        expect(pickVenue([], 'a')).toBeNull();
    });

    it('loads venues and resolves the remembered one', async () => {
        apiMock.listPublicVenues.mockResolvedValue({ items: [...venues, { id: '', name: '无效' }] });
        VenueManager.rememberVenue('b');
        const result = await VenueManager.loadVenues();
        expect(result.venues.map((venue) => venue.id)).toEqual(['a', 'b']);
        expect(result.current.id).toBe('b');
        expect(VenueManager.venueClosed(result.current)).toBe(true);
    });

    it('treats a failed venue request as no venue so booking stays available', async () => {
        apiMock.listPublicVenues.mockRejectedValue(new Error('offline'));
        const result = await VenueManager.loadVenues();
        expect(result).toEqual({ current: null, venues: [] });
        expect(VenueManager.venueClosed(result.current)).toBe(false);
    });

    it('calls only venues that publish a phone number', () => {
        VenueManager.callVenue({ phone: '' });
        VenueManager.callVenue(null);
        expect(taroMock.makePhoneCall).not.toHaveBeenCalled();
        VenueManager.callVenue({ phone: '18521301857' });
        expect(taroMock.makePhoneCall).toHaveBeenCalledWith({ phoneNumber: '18521301857' });
    });
});
