import { definePage } from '../../kit/page.js';
import { nav, page } from '../../kit/api.js';
import { normalizeOverview } from '../../core/courses.js';
import { buildImageDetailUrl } from '../../core/kanyueInfoLinks.js';
import { findStudio, memberCard } from '../../core/memberCards.js';
import { venueFacts } from '../../core/venues.js';
import { Api } from '../../services/apis.js';
import { UserManager } from '../../services/usermanager.js';
import { VenueManager } from '../../services/venuemanager.js';

// One studio, seen from the user's membership: the card, the studio's venues and its own introduction.
definePage({
    data: () => ({ card: null, infoLinks: [], loading: true, role: 'student', venues: [] }),
    computed: {
        venueRows: (d) => d.venues.map((venue) => ({ facts: venueFacts(venue), id: venue.id, name: venue.name, phone: venue.phone })),
    },
    onLoad(query = {}) {
        this.studioId = decodeURIComponent(query.id || '');
    },
    onShow() {
        this.load();
    },
    onPullDownRefresh() {
        return this.load();
    },
    methods: {
        async load() {
            const studio = findStudio(this.studioId);
            if (!studio) {
                await this.set({ card: null, loading: false });
                return;
            }
            page.title(studio.name);
            const role = UserManager.getRole();
            const student = UserManager.isLogin() && role !== 'teacher';
            const [overview, { venues }] = await Promise.all([
                student ? Api.getLearningOverview().then(normalizeOverview).catch(() => null) : null,
                VenueManager.loadVenues(),
            ]);
            const coverUrl = venues.find((venue) => venue.coverUrl)?.coverUrl || '';
            await this.set({
                card: memberCard(studio, { role, courses: overview ? overview.courses : null, coverUrl }),
                infoLinks: studio.infoLinks || [],
                loading: false,
                role,
                venues,
            });
        },
        goBooking() {
            nav.tab('/pages/appointmentBooking/index');
        },
        callVenue(event) {
            VenueManager.callVenue(this.data.venues.find((venue) => venue.id === event.currentTarget.dataset.id));
        },
        openInfo(event) {
            const url = buildImageDetailUrl(this.data.infoLinks.find((link) => link.id === event.detail.id));
            if (url) nav.to(url);
        },
    },
});
