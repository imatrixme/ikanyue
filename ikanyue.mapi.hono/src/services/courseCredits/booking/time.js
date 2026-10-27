const SHANGHAI_OFFSET_MINUTES = 8 * 60;

function localParts(value) {
    const shifted = new Date(Date.parse(value) + SHANGHAI_OFFSET_MINUTES * 60000);
    return {
        date: shifted.toISOString().slice(0, 10),
        weekday: shifted.getUTCDay() || 7,
        minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    };
}

function localDateMinuteToIso(date, minute) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 0, minute - SHANGHAI_OFFSET_MINUTES)).toISOString();
}

function addLocalDays(date, count) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function overlaps(startA, endA, startB, endB) {
    return Date.parse(startA) < Date.parse(endB) && Date.parse(endA) > Date.parse(startB);
}

function sameRange(startA, endA, startB, endB) {
    return Date.parse(startA) === Date.parse(startB) && Date.parse(endA) === Date.parse(endB);
}

module.exports = { addLocalDays, localDateMinuteToIso, localParts, overlaps, sameRange };
