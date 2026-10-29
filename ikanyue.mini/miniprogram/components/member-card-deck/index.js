import { defineComponent } from '../../kit/component.js';

// Membership cards as a swipeable stack: the front card is open, the next ones peek out behind it.
// Gestures and layout run in deck.wxs; this side only keeps the current index for the dots and taps.
defineComponent({
    props: {
        cards: { type: Array, value: [] },
    },
    data: () => ({ current: 0 }),
    computed: {
        active: (d) => Math.min(d.current, Math.max(d.cards.length - 1, 0)),
        deckKey: (d) => `${d.cards.length}:${d.active}`,
    },
    methods: {
        onDeckChange({ current }) {
            this.set({ current });
        },
        // A tap on a card behind brings it forward; a tap on the front card opens it.
        onSelect(event) {
            const index = this.data.cards.findIndex((card) => card.id === event.detail.id);
            if (index !== this.data.active) this.set({ current: index });
            else this.emit('select', event.detail);
        },
        showCard(event) {
            this.set({ current: Number(event.currentTarget.dataset.index) });
        },
    },
});
