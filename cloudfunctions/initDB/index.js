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

  // 默认定价配置
  const pc = await db.collection('pricing_config').count();
  if (pc.total === 0) {
    const prices = [
      { category: 'beautify', tokens: 2 },
      { category: 'color', tokens: 1 },
      { category: 'style', tokens: 3 },
      { category: 'auto', tokens: 2 },
    ];
    for (const p of prices) {
      await db.collection('pricing_config').add({
        data: { ...p, updated_at: new Date() }
      });
    }
    results['default_pricing'] = 'inserted 4';
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

  return results;
};
