const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getActiveModel(category) {
  const res = await db.collection('model_configs')
    .where({ category, is_active: true }).limit(1).get();
  if (res.data.length === 0) throw new Error('没有可用的模型，请联系管理员');
  return res.data[0];
}

// 调用 AI API 处理图片
// 支持两种鉴权协议：
//  - Face++ 类：有 api_secret，用 multipart/form-data 传 api_key+api_secret+image_url，
//    返回 JSON，图片在 result 字段（base64）。
//  - Bearer Token 类（如 Replicate）：只有 api_key，用 Header Authorization: Bearer，
//    直接返回二进制图片。
async function callAIModel(model, imageUrl, processType, subType, params) {
  const config = model.config || {};
  const apiUrl = (model.api_url || '').replace(/^(POST|GET|PUT|DELETE|PATCH)\s+/i, '').trim();

  // ---- Face++ 类：双密钥 form-data 鉴权 ----
  if (model.api_secret) {
    const form = new FormData();
    form.append('api_key', model.api_key);
    form.append('api_secret', model.api_secret);
    form.append('image_url', imageUrl);
    Object.keys(config).forEach(k => form.append(k, config[k]));
    if (params) {
      Object.keys(params).forEach(k => form.append(k, params[k]));
    }

    let res;
    try {
      res = await axios.post(apiUrl, form, {
        headers: form.getHeaders(),
        timeout: 30000,
      });
    } catch (e) {
      let detail = e.message;
      if (e.response && e.response.data) {
        try { detail = JSON.stringify(e.response.data); } catch (_) { detail = String(e.response.data); }
      }
      throw new Error('API 请求失败 HTTP ' + (e.response ? e.response.status : '') + ': ' + detail);
    }

    const json = res.data;
    if (!json || !json.result) {
      throw new Error('AI 处理失败：' + (json && json.error_message ? json.error_message : JSON.stringify(json)));
    }
    return Buffer.from(json.result, 'base64');
  }

  // ---- Bearer Token 类：直接返回二进制 ----
  const payload = {
    image_url: imageUrl,
    task_type: subType,
    ...config,
    ...(params || {}),
  };
  let res;
  try {
    res = await axios.post(model.api_url, payload, {
      headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
      timeout: 30000,
      responseType: 'arraybuffer',
    });
  } catch (e) {
    let detail = e.message;
    if (e.response && e.response.data) {
      try { detail = Buffer.from(e.response.data).toString('utf8'); } catch (_) { detail = '[binary]'; }
    }
    throw new Error('API 请求失败 HTTP ' + (e.response ? e.response.status : '') + ': ' + detail);
  }
  return Buffer.from(res.data);
}

exports.main = async (event, context) => {
  const { imageFileID, processType, subType, params } = event;
  if (!imageFileID || !processType || !subType) {
    return { err: '缺少必要参数' };
  }

  const { OPENID } = cloud.getWXContext();

  // 1. 获取云存储临时链接
  const urlRes = await cloud.getTempFileURL({ fileList: [imageFileID] });
  const imageUrl = urlRes.fileList[0].tempFileURL;

  // 2. 查询启用的模型
  const model = await getActiveModel(processType);

  // 3. 调用 AI 处理，传入 params
  const resultBuffer = await callAIModel(model, imageUrl, processType, subType, params || undefined);

  // 4. 预览图直接复用结果图（水印由前端 CSS 叠加，避免引入 sharp 原生模块依赖）
  const previewBuffer = resultBuffer;

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
