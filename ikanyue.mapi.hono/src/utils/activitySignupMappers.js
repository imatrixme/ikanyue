/**
 * PocketBase 记录映射工具 - 活动报名
 */

const { resolveRelationId } = require('./recordMappers');
const { processActivityFiles } = require('./fileUrl');

function buildActivityForSignup(activity) {
    if (!activity) {
        return null;
    }

    const processed = processActivityFiles(activity);
    const maxParticipants = processed.maxParticipants ?? processed.max_participants ?? 0;
    const currentParticipants = processed.currentParticipants ?? processed.current_participants ?? 0;

    return {
        id: processed.id,
        title: processed.title || '',
        description: processed.description || '',
        startTime: processed.startTime || null,
        endTime: processed.endTime || null,
        location: processed.location || '',
        price: processed.price || 0,
        type: processed.type || '',
        status: processed.status || '',
        tags: processed.tags || [],
        coverImageUrl: processed.coverImageUrl || '',
        images: processed.imageUrls || processed.images || [],
        imageUrls: processed.imageUrls || [],
        maxParticipants,
        currentParticipants,
        externalLink: processed.externalLink || processed.external_link || '',
        created: processed.created,
        updated: processed.updated,
    };
}

function mapActivitySignupRecord(record) {
    if (!record) {
        return null;
    }

    const activityExpand = record.expand?.activityId;

    return {
        id: record.id,
        userId: resolveRelationId(record.userId),
        activityId: resolveRelationId(record.activityId),
        realName: record.realName || record.realname || '',
        age: record.age ?? null,
        status: record.status || 'registered',
        created: record.created,
        updated: record.updated,
        activity: buildActivityForSignup(activityExpand),
    };
}

module.exports = {
    mapActivitySignupRecord,
};

