const { normalizeString } = require('./opsUtils');

async function authenticatePocketBaseTeacher(teacher, password, cellphone) {
    const identities = [teacher.username, teacher.email, cellphone].map(normalizeString).filter(Boolean);
    if (!identities.length) {
        return false;
    }
    try {
        const PocketBase = await import('pocketbase');
        const url = process.env.PB_URL || 'http://127.0.0.1:8090';
        for (const identity of [...new Set(identities)]) {
            const authClient = new PocketBase.default(url);
            try {
                const auth = await authClient.collection('teachers').authWithPassword(identity, password);
                if (auth?.record?.id === teacher.id) {
                    return true;
                }
            } catch {
                // Try the next configured identity.
            }
        }
    } catch {
        return false;
    }
    return false;
}

module.exports = { authenticatePocketBaseTeacher };
