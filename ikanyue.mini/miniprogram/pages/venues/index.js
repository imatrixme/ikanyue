import { definePage } from '../../kit/page.js';
import { nav, system } from '../../kit/api.js';
import { venueCards } from '../../core/venues.js';
import { VenueManager } from '../../services/venuemanager.js';

definePage({
    data: () => ({ currentId: '', loading: true, venues: [] }),
    computed: {
        cards: (d) => venueCards(d.venues, d.currentId),
    },
    onShow() {
        this.loadData();
    },
    onPullDownRefresh() {
        return this.loadData();
    },
    methods: {
        async loadData() {
            await this.set({ loading: true });
            const { current, venues } = await VenueManager.loadVenues();
            await this.set({ venues, currentId: current?.id || '', loading: false });
        },
        select(event) {
            const { id } = event.currentTarget.dataset;
            VenueManager.rememberVenue(id);
            this.set({ currentId: id });
            // Opened from home or the booking tab in normal use; fall back to home when it is the only page.
            if (system.currentPages().length > 1) nav.back();
            else nav.tab('/pages/home/index');
        },
    },
});
