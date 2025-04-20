chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAuthPage') {
    chrome.tabs.create({
      url: 'https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d'
    }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при создании вкладки:', chrome.runtime.lastError);
        sendResponse({ error: 'Не удалось открыть страницу авторизации' });
        return;
      }
      chrome.storage.local.set({ authTabId: tab.id });
      sendResponse({ success: true });
    });
    return true; // Указываем, что ответ будет асинхронным
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    const token = url.hash.match(/access_token=([^&]+)/);
    if (token && token[1]) {
      const extractedToken = token[1];
      chrome.storage.local.set({ yandexMusicToken: extractedToken }, () => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка при сохранении токена:', chrome.runtime.lastError);
          return;
        }
        chrome.runtime.sendMessage({ action: 'tokenUpdated', token: extractedToken }).catch((error) => {
          console.log('Попап не открыт, сообщение не отправлено:', error);
        });
        chrome.storage.local.get(['authTabId'], (result) => {
          if (result.authTabId === tabId) {
            chrome.tabs.remove(tabId, () => {
              if (chrome.runtime.lastError) {
                console.error('Ошибка при закрытии вкладки:', chrome.runtime.lastError);
              }
            });
          }
        });
      });
    }
  }
});
