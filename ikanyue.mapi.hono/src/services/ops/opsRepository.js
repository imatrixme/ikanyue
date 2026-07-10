const pb = require('../../utils/pocketbase');

class OpsRepository {
    constructor(client = pb) {
        this.client = client;
    }

    collection(name) {
        return this.client.collection(name);
    }

    async list(name, page = 1, perPage = 20, options = {}) {
        return this.collection(name).getList(page, perPage, withoutAutoCancellation(options));
    }

    async get(name, id, options = {}) {
        return this.collection(name).getOne(id, withoutAutoCancellation(options));
    }

    async create(name, data) {
        return this.collection(name).create(data, withoutAutoCancellation());
    }

    async update(name, id, data) {
        return this.collection(name).update(id, data, withoutAutoCancellation());
    }

    async delete(name, id) {
        return this.collection(name).delete(id, withoutAutoCancellation());
    }
}

function withoutAutoCancellation(options = {}) {
    return { ...options, requestKey: null };
}

module.exports = { OpsRepository, withoutAutoCancellation };
