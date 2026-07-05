const cloud = require('wx-server-sdk');
const axios = require('axios');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 模型调度：获取当前分类启用的第一个模型
async function getActiveModel(category) {
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}

// 调用 AI API 处理图片
async function callAIModel(model, imageUrl, processType, subType) {
  const payload = {
    image_url: imageUrl,
    task_type: subType,
    ...(model.config || {}),
  };
  const res = await axios.post(model.api_url, payload, {
    headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
    timeout: 25000,
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}

// 添加水印文字（通过 canvas 绘制，简化为叠加文字层）
async function addWatermark(imageBuffer, text) {
  // 对于云函数环境，使用 sharp 合成水印
  const sharp = require('sharp');
  const watermarkSvg = Buffer.from(
    '<svg width="200" height="50"><text x="10" y="35" font-size="24" fill="rgba(255,255,255,0.6)" font-family="sans-serif">' + text + '</text></svg>'
  );
  return sharp(imageBuffer)
    .composite([{ input: watermarkSvg, gravity: 'southeast' }])
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}

exports.main = async (event, context) => {
  const { imageFileID, processType, subType } = event;
  if (!imageFileID || !processType || !subType) {
    return { err: '缺少必要参数' };
  }

  const { OPENID } = cloud.getWXContext();

  // 1. 获取云存储临时链接
  const urlRes = await cloud.getTempFileURL({ fileList: [imageFileID] });
  const imageUrl = urlRes.fileList[0].tempFileURL;

  // 2. 查询启用的模型
  const model = await getActiveModel(processType);

  // 3. 调用 AI 处理
  const resultBuffer = await callAIModel(model, imageUrl, processType, subType);

  // 4. 生成水印预览图
  const previewBuffer = await addWatermark(resultBuffer, 'AI美化预览');

  // 5. 上传到云存储
  const timestamp = Date.now();
  const resultUpload = await cloud.uploadFile({
    cloudPath: 'results/' + OPENID + '_' + timestamp + '_result.jpg',
    fileContent: resultBuffer,
  });
  const previewUpload = await cloud.uploadFile({
    cloudPath: 'previews/' + OPENID + '_' + timestamp + '_preview.jpg',
    fileContent: previewBuffer,
  });

  // 6. 写入 images 表
  const imageDoc = await db.collection('images').add({
    data: {
      user_id: OPENID,
      original_url: imageFileID,
      preview_url: previewUpload.fileID,
      result_url: resultUpload.fileID,
      process_type: processType,
      sub_type: subType,
      status: 'completed',
      is_downloaded: false,
      created_at: new Date(),
      _openid: OPENID,
    }
  });

  return { imageId: imageDoc._id, previewFileID: previewUpload.fileID };
};
