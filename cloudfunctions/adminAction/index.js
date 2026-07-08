const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ALLOWED_COLLECTIONS = [
  'model_configs', 'pricing_config', 'subscribe_config',
  'invite_config', 'activities', 'token_packages', 'ad_config',
];

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action, collection, docId, data } = event;

  const userRes = await db.collection('users').where({ _openid: OPENID }).get();
  if (userRes.data.length === 0 || userRes.data[0].role !== 'admin') {
    return { err: '无权限' };
  }

  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    return { err: '不允许操作该集合' };
  }

  if (!['add', 'update', 'remove'].includes(action)) {
    return { err: '不支持的操作类型' };
  }

  try {
    if (action === 'add') {
      const res = await db.collection(collection).add({ data: { ...data, updated_at: new Date() } });
      return { ok: true, _id: res._id };
    }
    if (action === 'update') {
      await db.collection(collection).doc(docId).update({ data: { ...data, updated_at: new Date() } });
      return { ok: true };
    }
    if (action === 'remove') {
      await db.collection(collection).doc(docId).remove();
      return { ok: true };
    }
  } catch (e) {
    return { err: e.message };
  }
};
