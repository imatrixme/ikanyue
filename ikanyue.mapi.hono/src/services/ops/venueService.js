const { normalizeString } = require('./opsUtils');

const VENUES = 'venues';
const PHONE_PATTERN = /^[0-9+\-\s]{0,20}$/;
const FIELD_LABELS = { address: '地址', intro: '简介', name: '场馆名称', openingHours: '营业时间' };
const FIELD_LIMITS = { address: 120, intro: 120, name: 40, openingHours: 80 };

// Venues are display-only for now: students switch between them in the mini program,
// and `bookable` decides whether a venue offers online booking or a phone hand-off.
class VenueService {
    constructor(repository, auditService = null) {
        this.repository = repository;
        this.auditService = auditService;
    }

    async listForAdmin(operator) {
        assertAdmin(operator);
        const result = await this.repository.list(VENUES, 1, 200, { sort: 'sortOrder' });
        return { items: (result.items || []).map(adminVenue) };
    }

    async listPublic() {
        const result = await this.repository.list(VENUES, 1, 200, {
            filter: 'status = "active"',
            sort: 'sortOrder',
        });
        return { items: (result.items || []).map(publicVenue) };
    }

    async create(operator, input = {}) {
        assertAdmin(operator);
        const venue = adminVenue(await this.repository.create(VENUES, validateVenuePayload(input)));
        await this.audit(operator, 'ops.venue.create', venue);
        return venue;
    }

    async update(operator, id, input = {}) {
        assertAdmin(operator);
        const venueId = normalizeString(id);
        if (!venueId) throw userError('场馆不能为空');
        const existing = await this.repository.get(VENUES, venueId);
        const payload = validateVenuePayload({ ...existing, ...input });
        const venue = adminVenue(await this.repository.update(VENUES, venueId, payload));
        await this.audit(operator, 'ops.venue.update', venue);
        return venue;
    }

    async audit(operator, action, venue) {
        if (!this.auditService) return;
        await this.auditService.record({
            actor: operator,
            action,
            resourceType: VENUES,
            resourceId: venue.id,
            outcome: 'success',
            metadata: { bookable: venue.bookable, name: venue.name, status: venue.status },
        });
    }
}

function validateVenuePayload(input = {}) {
    const name = normalizeString(input.name);
    if (!name) throw userError('场馆名称不能为空');
    const payload = {
        address: normalizeString(input.address),
        bookable: input.bookable === true || input.bookable === 'true',
        intro: normalizeString(input.intro),
        name,
        openingHours: normalizeString(input.openingHours),
        phone: normalizeString(input.phone),
        sortOrder: toInteger(input.sortOrder),
        status: input.status === 'inactive' ? 'inactive' : 'active',
    };
    for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
        if (payload[field].length > limit) throw userError(`${FIELD_LABELS[field]}不能超过 ${limit} 个字`);
    }
    if (!PHONE_PATTERN.test(payload.phone)) throw userError('咨询电话只能包含数字、空格、+ 和 -');
    return payload;
}

function publicVenue(item = {}) {
    return {
        address: text(item.address),
        bookable: item.bookable === true,
        id: item.id,
        intro: text(item.intro),
        name: text(item.name),
        openingHours: text(item.openingHours),
        phone: text(item.phone),
    };
}

function adminVenue(item = {}) {
    return {
        ...publicVenue(item),
        sortOrder: toInteger(item.sortOrder),
        status: item.status === 'inactive' ? 'inactive' : 'active',
    };
}

function text(value) {
    return typeof value === 'string' ? value : '';
}

function toInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function assertAdmin(user = {}) {
    if (!user.id || !user.isAdmin) {
        const error = new Error('需要管理员权限');
        error.code = 403;
        throw error;
    }
}

function userError(message) {
    const error = new Error(message);
    error.code = 400;
    return error;
}

module.exports = { VenueService, adminVenue, publicVenue, validateVenuePayload };
