const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 1x1 白色 JPEG，base64 内嵌——不依赖外部 URL，避免 INVALID_IMAGE_URL
const TEST_IMAGE_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+igAoAK/9k=';

// 测试连通性时，这些错误说明 API 可达、密钥有效，只是测试图太小/没人脸
const HARMLESS_ERRORS = ['NO_FACE_FOUND', 'IMAGE_ERROR', 'IMAGE_TOO_SMALL', 'INVALID_IMAGE_SIZE', 'IMAGE_RESOLUTION_TOO_LOW'];

exports.main = async (event, context) => {
  const { modelId } = event;
  const { OPENID } = cloud.getWXContext();

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
    return { err: '无权限' };
  }

  const modelRes = await db.collection('model_configs').doc(modelId).get();
  const model = modelRes.data;
  if (!model) return { ok: false, error: '模型不存在' };
  const apiUrl = (model.api_url || '').replace(/^(POST|GET|PUT|DELETE|PATCH)\s+/i, '').trim();

  const start = Date.now();
  try {
    let response;
    if (model.api_secret) {
      // Face++ 类：form-data 鉴权，用 image_base64 传图
      const form = new FormData();
      form.append('api_key', model.api_key);
      form.append('api_secret', model.api_secret);
      form.append('image_base64', TEST_IMAGE_BASE64);
      Object.keys(model.config || {}).forEach(k => form.append(k, model.config[k]));

      response = await axios.post(apiUrl, form, {
        headers: form.getHeaders(),
        timeout: 25000,
        validateStatus: () => true,
      });
    } else {
      // Bearer Token 类：用 image_base64 传图
      response = await axios.post(apiUrl, {
        image_base64: TEST_IMAGE_BASE64,
        task_type: 'test',
        ...(model.config || {}),
      }, {
        headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
        timeout: 25000,
        responseType: 'arraybuffer',
        validateStatus: () => true,
      });
    }

    const status = response.status;

    // 提取 API 返回内容
    let detail = '';
    let errorBody = null;
    if (response.data) {
      if (Buffer.isBuffer(response.data)) {
        try { detail = Buffer.from(response.data).toString('utf8'); } catch (e) { detail = '[binary]'; }
      } else if (typeof response.data === 'object') {
        detail = JSON.stringify(response.data);
        errorBody = response.data;
      } else {
        detail = String(response.data);
      }
      if (detail.length > 500) detail = detail.slice(0, 500) + '...';
    }

    // HTTP 2xx → 连通成功
    if (status >= 200 && status < 300) {
      return { ok: true, latency: Date.now() - start };
    }

    // 检查是否是"无害"错误（API 可达、密钥有效，只是测试图太小/没人脸）
    const detailUpper = detail.toUpperCase();
    const harmless = HARMLESS_ERRORS.some(code => detailUpper.includes(code));

    if (harmless) {
      return { ok: true, latency: Date.now() - start, note: 'API 连通正常（测试图太小，返回业务提示而非真正的处理结果）' };
    }

    return { ok: false, error: 'HTTP ' + status + ': ' + detail, latency: Date.now() - start };
  } catch (e) {
    let detail = e.message;
    if (e.response && e.response.data) {
      try { detail = JSON.stringify(e.response.data).slice(0, 500); } catch (e2) { /* keep e.message */ }
    }
    return { ok: false, error: detail, latency: Date.now() - start };
  }
};
