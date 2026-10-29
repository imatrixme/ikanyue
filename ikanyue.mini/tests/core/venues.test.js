import { describe, expect, it } from 'vitest';
import { venueCards, venueFacts } from '../../miniprogram/core/venues.js';

describe('venue page logic', () => {
    it('hides venue facts that are not configured', () => {
        expect(venueFacts({ address: '', openingHours: '' })).toEqual([]);
        expect(venueFacts({ address: '某路 1 号', openingHours: '' })).toEqual([
            { icon: 'location-muted', key: 'address', text: '某路 1 号' },
        ]);
    });

    it('marks the current venue and explains booking availability', () => {
        const cards = venueCards([
            { id: 'a', name: '看乐艺术', intro: '声乐课程与预约', bookable: true, openingHours: '每天 10:00-21:00' },
            { id: 'b', name: '看乐二店', intro: '', bookable: false },
        ], 'b');
        expect(cards.map((card) => [card.id, card.current, card.bookingText])).toEqual([
            ['a', false, '可在线约课'],
            ['b', true, '暂只支持电话咨询'],
        ]);
        expect(cards[0].facts).toEqual([{ icon: 'clock-muted', key: 'openingHours', text: '每天 10:00-21:00' }]);
    });
});
