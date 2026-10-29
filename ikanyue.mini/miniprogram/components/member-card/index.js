import { defineComponent } from '../../kit/component.js';

// A studio membership card ({ id, name, tagline, summary, theme, coverUrl } from core/memberCards.js).
// The studio cover shows behind a soft veil; without one, the card's theme wash carries the look.
defineComponent({
    props: {
        card: { type: Object, value: {} },
        // The full-width card on the card page: not tappable, no "进入" hint.
        large: { type: Boolean, value: false },
    },
    data: () => ({ coverFailed: false }),
    computed: {
        initial: (d) => String(d.card?.name || '').slice(0, 1),
        coverShown: (d) => Boolean(d.card?.coverUrl) && !d.coverFailed,
    },
    methods: {
        markCoverFailed() {
            this.set({ coverFailed: true });
        },
        onTap() {
            if (!this.data.large) this.emit('select', this.data.card);
        },
    },
});
