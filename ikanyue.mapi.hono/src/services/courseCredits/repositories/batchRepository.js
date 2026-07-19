const { compareFefo } = require('../domain/eligibility');
const { asDate } = require('../domain/time');
const { escapeFilter } = require('./operationRepository');

const FEFO_SORT = 'effectiveExpiresAt,priority,created,id';

async function findFefoCandidateBatches(pb, query) {
    const filter = buildFefoFilter(query);
    const records = await pb.collection('credit_batches').getFullList({
        filter,
        sort: FEFO_SORT,
        batch: query.batchSize || 200,
    });
    return [...records].sort(compareFefo);
}

function buildFefoFilter(query) {
    const studentId = escapeFilter(query.studentId);
    const creditTypeId = escapeFilter(query.creditTypeId);
    const sessionStart = asDate(query.sessionStart, 'sessionStart').toISOString();
    return [
        `studentId="${studentId}"`,
        `creditTypeId="${creditTypeId}"`,
        'availableQuantity > 0',
        '(status="active" || status="unactivated")',
        `(validFrom="" || validFrom<="${sessionStart}")`,
        `((status="active" && (effectiveExpiresAt="" || effectiveExpiresAt>"${sessionStart}")) || `
            + `(status="unactivated" && activationDeadline>"${sessionStart}"))`,
    ].join(' && ');
}

module.exports = { FEFO_SORT, buildFefoFilter, findFefoCandidateBatches };
