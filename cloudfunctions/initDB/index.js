const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const names = [
    'users', 'token_records', 'orders', 'images', 'model_configs',
    'activities', 'user_activity_tokens', 'token_packages',
    'pricing_config', 'subscribe_config', 'invite_config', 'invite_records',
    'ad_config',
  ];
  const results = {};

  for (const name of names) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      results[name] = e.errCode === -1 ? 'exists' : 'error: ' + e.message;
    }
  }

  // 默认定价配置（按子选项，非大类）
  // 检测旧格式记录（无 sub_type 字段），如有则清理后重新插入
  const oldPcRes = await db.collection('pricing_config').where({ sub_type: db.command.exists(false) }).get();
  if (oldPcRes.data.length > 0) {
    const _ = db.command;
    for (const old of oldPcRes.data) {
      await db.collection('pricing_config').doc(old._id).remove();
    }
    results['old_pricing_cleaned'] = oldPcRes.data.length;
  }

  const pc = await db.collection('pricing_config').count();
  if (pc.total === 0) {
    const prices = [
      { category: 'beautify', sub_type: 'smooth', tokens: 2 },
      { category: 'beautify', sub_type: 'whiten', tokens: 2 },
      { category: 'beautify', sub_type: 'thin_face', tokens: 3 },
      { category: 'beautify', sub_type: 'big_eyes', tokens: 3 },
      { category: 'beautify', sub_type: 'acne_removal', tokens: 2 },
      { category: 'color', sub_type: 'auto_tone', tokens: 1 },
      { category: 'color', sub_type: 'filter', tokens: 1 },
      { category: 'color', sub_type: 'sharpen', tokens: 1 },
      { category: 'color', sub_type: 'dehaze_denoise', tokens: 2 },
      { category: 'color', sub_type: 'lighting', tokens: 2 },
      { category: 'style', sub_type: 'anime', tokens: 3 },
      { category: 'style', sub_type: 'oil_painting', tokens: 3 },
      { category: 'style', sub_type: 'ink', tokens: 3 },
      { category: 'style', sub_type: 'sketch', tokens: 2 },
      { category: 'style', sub_type: 'pixel', tokens: 3 },
      { category: 'auto', sub_type: 'auto_enhance', tokens: 2 },
    ];
    for (const p of prices) {
      await db.collection('pricing_config').add({
        data: { ...p, updated_at: new Date() }
      });
    }
    results['default_pricing'] = 'inserted 16';
  }

  // 默认订阅配置
  const sc = await db.collection('subscribe_config').count();
  if (sc.total === 0) {
    await db.collection('subscribe_config').add({
      data: {
        name: '月度订阅', price: 1999, daily_tokens: 5,
        wx_template_id: '', created_at: new Date(),
      }
    });
    results['default_subscribe'] = 'inserted';
  }

  // 默认邀请配置
  const ic = await db.collection('invite_config').count();
  if (ic.total === 0) {
    await db.collection('invite_config').add({
      data: {
        inviter_reward: 10, invitee_reward: 5,
        trigger_condition: 'first_paid', created_at: new Date(),
      }
    });
    results['default_invite'] = 'inserted';
  }

  // 默认广告配置
  const ac = await db.collection('ad_config').count();
  if (ac.total === 0) {
    await db.collection('ad_config').add({
      data: {
        daily_limit: 3, reward_tokens: 2,
        is_active: true, updated_at: new Date(),
      }
    });
    results['default_ad_config'] = 'inserted';
  }

  // 建索引（幂等：已存在则忽略）
  const indexes = [
    { collection: 'user_activity_tokens', name: 'idx_user_activity', fields: [{ fieldPath: 'user_id', order: 'asc' }, { fieldPath: 'activity_id', order: 'asc' }], unique: true },
    { collection: 'orders', name: 'idx_status_created', fields: [{ fieldPath: 'status', order: 'asc' }, { fieldPath: 'created_at', order: 'asc' }] },
    { collection: 'invite_records', name: 'idx_invitee', fields: [{ fieldPath: 'invitee_openid', order: 'asc' }] },
    { collection: 'token_records', name: 'idx_user_created', fields: [{ fieldPath: 'user_id', order: 'asc' }, { fieldPath: 'created_at', order: 'desc' }] },
  ];
  for (const idx of indexes) {
    try {
      await db.collection(idx.collection).createIndex({
        name: idx.name,
        unique: !!idx.unique,
        keys: idx.fields.map(f => ({ fieldName: f.fieldPath, order: f.order })),
      });
      results['index_' + idx.name] = 'created';
    } catch (e) {
      results['index_' + idx.name] = e.errCode === -1 ? 'exists' : 'error: ' + e.message;
    }
  }

  // 默认充值套餐
  const tpCount = await db.collection('token_packages').count();
  if (tpCount.total === 0) {
    const packages = [
      { name: '50代币', price: 600, tokens: 50, bonus: 0, is_active: true },
      { name: '200+20代币', price: 1990, tokens: 200, bonus: 20, is_active: true },
      { name: '800+100代币', price: 6800, tokens: 800, bonus: 100, is_active: true },
    ];
    for (const pkg of packages) {
      await db.collection('token_packages').add({
        data: { ...pkg, created_at: new Date() }
      });
    }
    results['default_packages'] = 'inserted 3';
  }

  return results;
};
