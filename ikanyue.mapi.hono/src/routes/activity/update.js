/**
 * 活动更新接口
 * 更新现有活动信息，需要管理员权限
 * 对应原项目: api/controllers/activity/update.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 活动更新处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityUpdateHandler(c) {
  const body = await c.req.parseBody();
  const user = c.get('user');

  const { id, ...updateData } = body;

  // ID必填验证
  if (!id || !id.trim()) {
    return c.error(400, '活动ID不能为空');
  }

  try {
    // 检查活动是否存在
    const [checkErr, existingActivity] = await to(pb.collection('activities').getOne(id.trim()));

    if (checkErr) {
      if (checkErr.status === 404) {
        return c.error(404, '活动不存在');
      }
      console.error('活动查询失败:', checkErr);
      return c.error(500, '查询失败，请稍后重试');
    }

    // 准备更新数据
    const processedData = {};

    // 处理可更新字段
    const allowedFields = [
      'title',
      'description',
      'startTime',
      'endTime',
      'location',
      'price',
      'coverImage',
      'images',
      'externalLink',
      'tags',
      'sequence',
      'maxParticipants',
      'status',
      'type',
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        processedData[field] = updateData[field];
      }
    });

    // 如果没有要更新的字段
    if (Object.keys(processedData).length === 0) {
      return c.error(400, '没有提供要更新的字段');
    }

    // 字段验证和处理
    if (processedData.title !== undefined) {
      if (!processedData.title || !processedData.title.trim()) {
        return c.error(400, '活动标题不能为空');
      }
      processedData.title = processedData.title.trim();
    }

    if (processedData.description !== undefined) {
      if (!processedData.description || !processedData.description.trim()) {
        return c.error(400, '活动描述不能为空');
      }
      processedData.description = processedData.description.trim();
    }

    if (processedData.location !== undefined) {
      if (!processedData.location || !processedData.location.trim()) {
        return c.error(400, '活动地点不能为空');
      }
      processedData.location = processedData.location.trim();
    }

    if (processedData.price !== undefined) {
      if (isNaN(processedData.price) || processedData.price < 0) {
        return c.error(400, '活动价格必须为非负数');
      }
      processedData.price = parseFloat(processedData.price);
    }

    if (processedData.sequence !== undefined) {
      if (isNaN(processedData.sequence) || processedData.sequence < 0) {
        return c.error(400, '排序序号必须为非负整数');
      }
      processedData.sequence = parseInt(processedData.sequence, 10);
    }

    if (processedData.maxParticipants !== undefined) {
      if (isNaN(processedData.maxParticipants) || processedData.maxParticipants < 0) {
        return c.error(400, '最大参与人数必须为非负整数');
      }
      processedData.maxParticipants = parseInt(processedData.maxParticipants, 10);
    }

    // 时间验证
    if (processedData.startTime || processedData.endTime) {
      const startTime = processedData.startTime || existingActivity.startTime;
      const endTime = processedData.endTime || existingActivity.endTime;

      const start = new Date(startTime);
      const end = new Date(endTime);

      if (isNaN(start.getTime())) {
        return c.error(400, '开始时间格式不正确');
      }

      if (isNaN(end.getTime())) {
        return c.error(400, '结束时间格式不正确');
      }

      if (start >= end) {
        return c.error(400, '开始时间必须早于结束时间');
      }
    }

    // 数组字段处理
    if (processedData.tags !== undefined) {
      processedData.tags = Array.isArray(processedData.tags) ? processedData.tags : [];
    }

    if (processedData.images !== undefined) {
      processedData.images = Array.isArray(processedData.images) ? processedData.images : [];
    }

    // 更新活动记录
    const [err, record] = await to(pb.collection('activities').update(id.trim(), processedData));

    if (err) {
      console.error('活动更新失败:', err);
      if (err.status === 400) {
        return c.error(400, '数据格式错误，请检查输入');
      }
      return c.error(500, '更新失败，请稍后重试');
    }

    return c.data(record, '活动更新成功');
  } catch (error) {
    console.error('活动更新异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { activityUpdateHandler };
