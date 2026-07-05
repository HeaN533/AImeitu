App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({ env: 'cloud1-d4gtgvys2156b7b53', traceUser: true });
    }
    this.globalData = { userInfo: null, isAdmin: false };
  },

  getUserInfo: async function () {
    if (this.globalData.userInfo) return this.globalData.userInfo;
    const db = wx.cloud.database();
    const res = await wx.cloud.callFunction({ name: 'checkInvite', data: {} });
    const { data } = await db.collection('users')
      .where({ _openid: '{openid}' }).get();
    if (data.length === 0) {
      const createRes = await db.collection('users').add({
        data: {
          role: 'user', tokens: 50, activity_tokens: 0,
          subscription: null, inviter_id: res.result.inviter_id || null,
          created_at: db.serverDate(),
        }
      });
      this.globalData.userInfo = {
        _id: createRes._id, role: 'user', tokens: 50, activity_tokens: 0
      };
    } else {
      this.globalData.userInfo = data[0];
    }
    this.globalData.isAdmin = this.globalData.userInfo.role === 'admin';
    return this.globalData.userInfo;
  },

  refreshUserInfo: async function () {
    this.globalData.userInfo = null;
    return this.getUserInfo();
  }
});
