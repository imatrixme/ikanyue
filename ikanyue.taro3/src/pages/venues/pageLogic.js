function venueFacts(venue = {}) {
    return [
        { icon: 'location-muted', key: 'address', text: venue.address },
        { icon: 'clock-muted', key: 'openingHours', text: venue.openingHours },
    ].filter((row) => Boolean(row.text));
}

function venueCards(venues = [], currentId = '') {
    return venues.map((venue) => ({
        bookingText: venue.bookable ? '可在线约课' : '暂只支持电话咨询',
        current: venue.id === currentId,
        facts: venueFacts(venue),
        id: venue.id,
        intro: venue.intro,
        name: venue.name,
    }));
}

export { venueCards, venueFacts };
