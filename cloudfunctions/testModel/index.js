const cloud = require('wx-server-sdk');
const axios = require('axios');
const FormData = require('form-data');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const TEST_IMAGE_URL = 'https://img.zcool.cn/community/01deed5b1c4cdaa8012165187c4e86.jpg@1280w_1l_2o_100sh.jpg';

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

  const start = Date.now();
  try {
    if (model.api_secret) {
      const form = new FormData();
      form.append('api_key', model.api_key);
      form.append('api_secret', model.api_secret);
      form.append('image_url', TEST_IMAGE_URL);
      await axios.post(model.api_url, form, {
        headers: form.getHeaders(),
        timeout: 25000,
      });
    } else {
      await axios.post(model.api_url, {
        image_url: TEST_IMAGE_URL,
        task_type: 'test',
        ...(model.config || {}),
      }, {
        headers: { 'Authorization': 'Bearer ' + model.api_key, 'Content-Type': 'application/json' },
        timeout: 25000,
        responseType: 'arraybuffer',
      });
    }
    return { ok: true, latency: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message, latency: Date.now() - start };
  }
};
