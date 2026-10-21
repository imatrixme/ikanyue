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

// PocketBase stores dates as "YYYY-MM-DD HH:MM:SS.sssZ" and compares filter literals as text,
// so an ISO "T" literal mis-orders against stored values on the same UTC day.
function filterTime(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().replace('T', ' ') : String(value ?? '');
}

module.exports = { addLocalDays, filterTime, localDateMinuteToIso, localParts, overlaps, sameRange };
