async function callFunction(name, data = {}) {
  try {
    const res = await wx.cloud.callFunction({ name, data });
    if (res.result && res.result.err) {
      wx.showToast({ title: res.result.err, icon: 'none' });
      throw new Error(res.result.err);
    }
    return res.result;
  } catch (err) {
    wx.showToast({ title: '网络异常，请重试', icon: 'none' });
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
