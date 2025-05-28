/**
 * 活动查询接口
 * 分页查询活动列表或获取单个活动详情，支持多种过滤条件
 * 对应原项目: api/controllers/activity/find.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 处理活动数据中的图片字段，转换为完整的URL
 * @param {Object} record - 活动记录
 * @returns {Object} - 处理后的活动记录
 */
function processActivityImages(record) {
  const s3Url = process.env.S3_URL || `${process.env.PB_URL}/api/files`;

  // 处理封面图
  if (record.coverImage) {
    // record.coverImageUrl = pb.files.getURL(record, record.coverImage);
    record.coverImageUrl = `${s3Url}/${record.collectionId}/${record.id}/${record.coverImage}`;
  }

  // 处理活动图片集
  if (record.images && Array.isArray(record.images) && record.images.length > 0) {
    // record.imageUrls = record.images.map((image) => pb.files.getURL(record, image));
    record.imageUrls = record.images.map(
      (image) => `${s3Url}/${record.collectionId}/${record.id}/${image}`
    );
  }

  return record;
}

/**
 * 活动查询处理器
 * @param {Object} c - Hono 上下文对象
 */
async function activityFindHandler(c) {
  const query = c.req.query();
  const {
    id = '',
    page = 1,
    limit = 20,
    status = 'active',
    sort = '-created',
    tags = '',
    type = '',
    location = ''
  } = query;

  try {
    // 查询单个活动
    if (id) {
      const [err, record] = await to(pb.collection('activities').getOne(id));

      if (err) {
        if (err.status === 404) {
          return c.error(404, '活动不存在');
        }
        console.error('活动查询失败:', err);
        return c.error(500, '查询失败，请稍后重试');
      }

      // 处理图片URL
      const processedRecord = processActivityImages(record);

      return c.data(processedRecord, '查询成功');
    }

    // 参数验证
    if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
      return c.error(400, '页码和每页数量必须为正整数');
    }

    if (limit > 100) {
      return c.error(400, '每页数量不能超过100');
    }

    // 构建过滤条件
    let filters = [];

    // 状态过滤
    if (status && status !== 'all') {
      filters.push(`status = "${status}"`);
    }

    // 标签过滤
    if (tags.trim()) {
      const tagArray = tags.split(',').map((tag) => tag.trim());
      for (const tag of tagArray) {
        filters.push(`tags ~ "${tag}"`);
      }
    }

    // 类型过滤
    if (type.trim()) {
      filters.push(`type = "${type.trim()}"`);
    }

    // 地点过滤
    if (location.trim()) {
      filters.push(`location ~ "${location.trim()}"`);
    }

    const filter = filters.length > 0 ? filters.join(' && ') : '';

    // 查询活动列表
    const [err, result] = await to(
      pb.collection('activities').getList(page, limit, {
        filter: filter,
        sort: sort
      })
    );

    if (err) {
      console.error('活动列表查询失败:', err);
      return c.error(500, '查询失败，请稍后重试');
    }

    // 处理每个活动的图片URL
    const processedItems = result.items.map((item) => processActivityImages(item));

    return c.data(
      {
        items: processedItems,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
        page: result.page,
        perPage: result.perPage
      },
      '查询成功'
    );
  } catch (error) {
    console.error('活动查询异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { activityFindHandler };
