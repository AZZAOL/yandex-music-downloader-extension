// background.js
async function fetchToken() {
  try {
    const response = await fetch('http://localhost:5000/get_token', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    if (data.token) {
      // Сохраняем токен
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ yandexMusicToken: data.token }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      return { success: true, token: data.token };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchToken') {
    fetchToken().then((result) => {
      sendResponse(result);
      // Оповещаем popup об изменении токена
      chrome.runtime.sendMessage({ action: 'tokenUpdated', token: result.token });
    });
    return true; // Оставляем соединение открытым для асинхронного ответа
  } else if (request.action === 'saveToken') {
    chrome.storage.local.set({ yandexMusicToken: request.token }, () => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при сохранении токена:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('Токен успешно сохранён');
        sendResponse({ success: true });
      }
    });
    return true;
  }
});