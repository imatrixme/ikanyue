/**
 * 音频材料更新接口
 * 更新现有音频材料信息，需要教师权限
 * 对应原项目: api/controllers/audioMaterial/update.js
 */

const pb = require('../../utils/pocketbase.js');
const to = require('await-to-js').default;

/**
 * 音频材料更新处理器
 * @param {Object} c - Hono 上下文对象
 */
async function audioMaterialUpdateHandler(c) {
  const body = await c.req.json();

  const { id, ...updateData } = body;

  // ID必填验证
  if (!id || !id.trim()) {
    return c.error(400, '音频材料ID不能为空');
  }

  try {
    // 检查音频材料是否存在
    const [checkErr, existingAudio] = await to(pb.collection('audio_materials').getOne(id.trim()));

    if (checkErr) {
      if (checkErr.status === 404) {
        return c.error(404, '音频材料不存在');
      }
      console.error('音频材料查询失败:', checkErr);
      return c.error(500, '查询失败，请稍后重试');
    }

    // 准备更新数据
    const processedData = {};

    // 处理可更新字段
    const allowedFields = [
      'title',
      'type',
      'description',
      'audioSource',
      'content',
      'publishedAt',
      'author',
      'duration',
      'sequence',
      'status',
      'coverImage',
      'language',
      'difficulty',
      'tags',
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

    // 基本字段验证
    if (processedData.title !== undefined && (!processedData.title || !processedData.title.trim())) {
      return c.error(400, '音频标题不能为空');
    }

    if (processedData.audioSource !== undefined && (!processedData.audioSource || !processedData.audioSource.trim())) {
      return c.error(400, '音频源文件不能为空');
    }

    // 数值类型验证
    if (processedData.duration !== undefined) {
      const duration = parseFloat(processedData.duration);
      if (isNaN(duration) || duration < 0) {
        return c.error(400, '音频时长必须为非负数');
      }
      processedData.duration = duration;
    }

    if (processedData.sequence !== undefined) {
      const sequence = parseInt(processedData.sequence, 10);
      if (isNaN(sequence) || sequence < 0) {
        return c.error(400, '排序序号必须为非负整数');
      }
      processedData.sequence = sequence;
    }

    if (processedData.difficulty !== undefined) {
      const difficulty = parseInt(processedData.difficulty, 10);
      if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
        return c.error(400, '难度等级必须为1-5之间的整数');
      }
      processedData.difficulty = difficulty;
    }

    // 枚举值验证
    if (processedData.language !== undefined && !['中文', '英文'].includes(processedData.language)) {
      return c.error(400, '语言选项只能是"中文"或"英文"');
    }

    if (processedData.status !== undefined && !['draft', 'published'].includes(processedData.status)) {
      return c.error(400, '状态只能是"draft"或"published"');
    }

    // 发布时间验证
    if (processedData.publishedAt !== undefined) {
      const publishDate = new Date(processedData.publishedAt);
      if (isNaN(publishDate.getTime())) {
        return c.error(400, '发布时间格式不正确');
      }
    }

    // 更新音频材料记录
    const [err, record] = await to(pb.collection('audio_materials').update(id.trim(), processedData));

    if (err) {
      console.error('音频材料更新失败:', err);
      if (err.status === 400) {
        return c.error(400, '数据格式错误，请检查输入');
      }
      return c.error(500, '更新失败，请稍后重试');
    }

    return c.data(record, '音频材料更新成功');
  } catch (error) {
    console.error('音频材料更新异常:', error);
    return c.error(500, '服务器内部错误');
  }
}

module.exports = { audioMaterialUpdateHandler };
