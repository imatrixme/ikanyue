/**
 * 文件URL处理工具
 * 统一处理PocketBase和S3文件URL的生成
 */

/**
 * 获取文件的完整URL
 * @param {Object} record - 数据库记录对象
 * @param {string} filename - 文件名
 * @returns {string} - 完整的文件URL
 */
function getFileUrl(record, filename) {
  if (!filename) return '';

  // 如果已经是完整URL，直接返回
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename;
  }

  // 优先使用S3配置
  if (process.env.S3_URL && process.env.S3_BUCKET) {
    return `${process.env.S3_URL}/${process.env.S3_BUCKET}/${record.collectionId}/${record.id}/${filename}`;
  }

  // 使用PocketBase本地文件服务
  return `${process.env.PB_URL}/api/files/${record.collectionId}/${record.id}/${filename}`;
}

/**
 * 处理音频材料记录的文件URL
 * @param {Object} record - 音频材料记录
 * @returns {Object} - 处理后的记录，包含完整URL字段
 */
function processAudioMaterialFiles(record) {
  if (!record) return record;

  const processedRecord = { ...record };

  // 处理音频源文件URL
  if (record.audioSource) {
    processedRecord.audioSourceUrl = getFileUrl(record, record.audioSource);
  }

  // 处理封面图片URL
  if (record.coverImage) {
    processedRecord.coverImageUrl = getFileUrl(record, record.coverImage);
  }

  return processedRecord;
}

/**
 * 处理视频材料记录的文件URL
 * @param {Object} record - 视频材料记录
 * @returns {Object} - 处理后的记录，包含完整URL字段
 */
function processVideoMaterialFiles(record) {
  if (!record) return record;

  const processedRecord = { ...record };

  // 处理视频源文件URL
  if (record.videoSource) {
    processedRecord.videoSourceUrl = getFileUrl(record, record.videoSource);
  }

  // 处理封面图片URL
  if (record.coverImage) {
    processedRecord.coverImageUrl = getFileUrl(record, record.coverImage);
  }

  // 处理预览图URL
  if (record.thumbnail) {
    processedRecord.thumbnailUrl = getFileUrl(record, record.thumbnail);
  }

  return processedRecord;
}

/**
 * 处理活动记录的文件URL
 * @param {Object} record - 活动记录
 * @returns {Object} - 处理后的记录，包含完整URL字段
 */
function processActivityFiles(record) {
  if (!record) return record;

  const processedRecord = { ...record };

  // 处理封面图
  if (record.coverImage) {
    processedRecord.coverImageUrl = getFileUrl(record, record.coverImage);
  }

  // 处理活动图片集
  if (record.images && Array.isArray(record.images) && record.images.length > 0) {
    processedRecord.imageUrls = record.images.map((image) => getFileUrl(record, image));
  }

  return processedRecord;
}

/**
 * 批量处理记录列表的文件URL
 * @param {Array} records - 记录列表
 * @param {Function} processor - 处理器函数
 * @returns {Array} - 处理后的记录列表
 */
function processBatchFiles(records, processor) {
  if (!Array.isArray(records)) return records;
  return records.map(processor);
}

module.exports = {
  getFileUrl,
  processAudioMaterialFiles,
  processVideoMaterialFiles,
  processActivityFiles,
  processBatchFiles,
};
