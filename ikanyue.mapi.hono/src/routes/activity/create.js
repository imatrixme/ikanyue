/**
 * 活动创建接口
 * 创建新的教学活动，需要管理员权限
 * 对应原项目: api/controllers/activity/create.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 活动创建处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityCreateHandler(c) {
  const body = await c.req.parseBody();
  const user = c.get('user');

  const {
    title,
    description,
    startTime,
    endTime,
    location,
    price,
    coverImage = '',
    images = [],
    externalLink = '',
    tags = [],
    sequence = 0,
    maxParticipants = 0,
    status = 'inactive',
    type = '',
  } = body;

  // 必填字段验证
  if (!title || !title.trim()) {
    return c.error(400, '活动标题不能为空');
  }

  if (!description || !description.trim()) {
    return c.error(400, '活动描述不能为空');
  }

  if (!startTime) {
    return c.error(400, '活动开始时间不能为空');
  }

  if (!endTime) {
    return c.error(400, '活动结束时间不能为空');
  }

  if (!location || !location.trim()) {
    return c.error(400, '活动地点不能为空');
  }

  if (price === undefined || price === null) {
    return c.error(400, '活动价格不能为空');
  }

  // 数据类型验证
  if (isNaN(price) || price < 0) {
    return c.error(400, '活动价格必须为非负数');
  }

  if (isNaN(sequence) || sequence < 0) {
    return c.error(400, '排序序号必须为非负整数');
  }

  if (isNaN(maxParticipants) || maxParticipants < 0) {
    return c.error(400, '最大参与人数必须为非负整数');
  }

  // 时间验证
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

  try {
    // 准备活动数据
    const activityData = {
      title: title.trim(),
      description: description.trim(),
      startTime: startTime,
      endTime: endTime,
      location: location.trim(),
      price: parseFloat(price),
      coverImage: coverImage || '',
      images: Array.isArray(images) ? images : [],
      externalLink: externalLink || '',
      tags: Array.isArray(tags) ? tags : [],
      sequence: parseInt(sequence, 10),
      maxParticipants: parseInt(maxParticipants, 10),
      currentParticipants: 0,
      status: status || 'inactive',
      type: type || '',
      creator: user.id,
    };

    // 创建活动记录
    const [err, record] = await to(pb.collection('activities').create(activityData));

    if (err) {
      console.error('活动创建失败:', err);
      if (err.status === 400) {
        return c.error(400, '数据格式错误，请检查输入');
      }
      return c.error(500, '创建失败，请稍后重试');
    }

    return c.data(record, '活动创建成功');
  } catch (error) {
    console.error('活动创建异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { activityCreateHandler };
