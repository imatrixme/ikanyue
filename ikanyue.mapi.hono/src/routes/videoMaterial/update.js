/**
 * 视频材料更新接口
 * 更新现有视频材料信息，需要教师权限
 * 对应原项目: api/controllers/videoMaterial/update.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 视频材料更新处理器
 * @param {Object} c - Hono 上下文对象
 */
async function videoMaterialUpdateHandler(c) {
  const body = await c.req.parseBody();
  const user = c.get('user');

  const { id, ...updateData } = body;

  // ID必填验证
  if (!id || !id.trim()) {
    return c.error(400, '视频材料ID不能为空');
  }

  try {
    // 检查视频材料是否存在
    const [checkErr, existingVideo] = await to(pb.collection('video_materials').getOne(id.trim()));

    if (checkErr) {
      if (checkErr.status === 404) {
        return c.error(404, '视频材料不存在');
      }
      console.error('视频材料查询失败:', checkErr);
      return c.error(500, '查询失败，请稍后重试');
    }

    // 准备更新数据
    const processedData = {};

    // 处理可更新字段
    const allowedFields = [
      'title',
      'type',
      'description',
      'videoSource',
      'content',
      'publishedAt',
      'author',
      'duration',
      'tags',
      'sequence',
      'status',
      'coverImage',
      'language',
      'difficulty',
      'resolution',
      'subtitles',
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
        return c.error(400, '视频标题不能为空');
      }
      processedData.title = processedData.title.trim();
    }

    if (processedData.type !== undefined) {
      if (!processedData.type || !processedData.type.trim()) {
        return c.error(400, '视频类型不能为空');
      }
      processedData.type = processedData.type.trim();
    }

    if (processedData.videoSource !== undefined) {
      if (!processedData.videoSource || !processedData.videoSource.trim()) {
        return c.error(400, '视频文件URL不能为空');
      }
      processedData.videoSource = processedData.videoSource.trim();
    }

    if (processedData.author !== undefined) {
      if (!processedData.author || !processedData.author.trim()) {
        return c.error(400, '视频作者不能为空');
      }
      processedData.author = processedData.author.trim();
    }

    if (processedData.duration !== undefined) {
      if (isNaN(processedData.duration) || processedData.duration < 0) {
        return c.error(400, '视频时长必须为非负数');
      }
      processedData.duration = parseInt(processedData.duration, 10);
    }

    if (processedData.sequence !== undefined) {
      if (isNaN(processedData.sequence) || processedData.sequence < 0) {
        return c.error(400, '排序序号必须为非负整数');
      }
      processedData.sequence = parseInt(processedData.sequence, 10);
    }

    if (processedData.difficulty !== undefined) {
      if (isNaN(processedData.difficulty) || processedData.difficulty < 1 || processedData.difficulty > 5) {
        return c.error(400, '难度等级必须为1-5之间的整数');
      }
      processedData.difficulty = parseInt(processedData.difficulty, 10);
    }

    // 发布时间验证
    if (processedData.publishedAt !== undefined) {
      const publishDate = new Date(processedData.publishedAt);
      if (isNaN(publishDate.getTime())) {
        return c.error(400, '发布时间格式不正确');
      }
    }

    // 文本字段清理
    ['description', 'content', 'coverImage', 'language', 'resolution', 'subtitles'].forEach((field) => {
      if (processedData[field] !== undefined) {
        processedData[field] = processedData[field].trim();
      }
    });

    // 数组字段处理
    if (processedData.tags !== undefined) {
      processedData.tags = Array.isArray(processedData.tags) ? processedData.tags : [];
    }

    // 更新视频材料记录
    const [err, record] = await to(pb.collection('video_materials').update(id.trim(), processedData));

    if (err) {
      console.error('视频材料更新失败:', err);
      if (err.status === 400) {
        return c.error(400, '数据格式错误，请检查输入');
      }
      return c.error(500, '更新失败，请稍后重试');
    }

    return c.data(record, '视频材料更新成功');
  } catch (error) {
    console.error('视频材料更新异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { videoMaterialUpdateHandler };
