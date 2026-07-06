async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data });
    if (res.result && res.result.err) {
      wx.showToast({ title: res.result.err, icon: 'none', duration: 3000 });
      throw new Error(res.result.err);
    }
    return res.result;
  } catch (err) {
    // 优先展示云函数返回的具体错误，避免统一吞成"网络异常"导致无法排查
    const msg = (err && err.errMsg) || (err && err.message) || '网络异常';
    console.error('callFunction [' + name + '] 失败:', err);
    wx.showToast({ title: msg, icon: 'none', duration: 3000 });
    throw err;
  }
}

async function uploadImage(filePath) {
  const cloudPath = 'images/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.jpg';
  const res = await wx.cloud.uploadFile({ cloudPath, filePath });
  return res.fileID;
}

async function getTempURL(fileID) {
  const res = await wx.cloud.getTempFileURL({ fileList: [fileID] });
  if (res.fileList[0].tempFileURL) return res.fileList[0].tempFileURL;
  throw new Error('获取链接失败');
}

module.exports = { callFunction, uploadImage, getTempURL };
