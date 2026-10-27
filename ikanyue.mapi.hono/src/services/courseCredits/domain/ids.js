const crypto = require('node:crypto');

function createRecordId(randomBytes = crypto.randomBytes) {
    return randomBytes(12).toString('hex').slice(0, 15);
}

function createOperationNo(prefix, at, recordId) {
    return `${prefix}-${new Date(at).getTime()}-${recordId}`;
}

module.exports = { createOperationNo, createRecordId };
