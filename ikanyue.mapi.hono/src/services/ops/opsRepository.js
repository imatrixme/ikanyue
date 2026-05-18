const pb = require('../../utils/pocketbase');

class OpsRepository {
    constructor(client = pb) {
        this.client = client;
    }

    collection(name) {
        return this.client.collection(name);
    }

    async list(name, page = 1, perPage = 20, options = {}) {
        return this.collection(name).getList(page, perPage, options);
    }

    async get(name, id, options = {}) {
        return this.collection(name).getOne(id, options);
    }

    async create(name, data) {
        return this.collection(name).create(data);
    }

    async update(name, id, data) {
        return this.collection(name).update(id, data);
    }

    async delete(name, id) {
        return this.collection(name).delete(id);
    }
}

module.exports = { OpsRepository };
