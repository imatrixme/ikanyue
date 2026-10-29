import { defineComponent } from '../../kit/component.js';
import { nav } from '../../kit/api.js';
import { VenueManager } from '../../services/venuemanager.js';

// Shown wherever booking would start when the current venue does not take online bookings.
defineComponent({
    props: {
        venue: { type: Object, value: {} },
    },
    methods: {
        call() {
            VenueManager.callVenue(this.data.venue);
        },
        switchVenue() {
            nav.to('/pages/venues/index');
        },
    },
});
