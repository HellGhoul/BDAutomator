const { Notification } = require('electron');

function notify(title, body) {
  if (!Notification.isSupported()) return false;
  try {
    new Notification({ title, body }).show();
    return true;
  } catch {
    return false;
  }
}

function notifyListItemsComplete(username) {
  const title = 'BDAutomator';
  const userLabel = username ? ` for ${username}` : '';
  const body = `Item listing completed${userLabel}.`;
  return notify(title, body);
}

module.exports = {
  notify,
  notifyListItemsComplete
};
