document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('tokenInput');
  const getTokenButton = document.getElementById('getTokenButton');
  const keyIcon = document.querySelector('.input-container i');
  
  if (!tokenInput || !getTokenButton || !keyIcon) {
    console.error('Не удалось найти один или несколько элементов DOM.');
    return;
  }

  function lockGetTokenButton() {
    getTokenButton.disabled = true;
    getTokenButton.classList.add('disabled');
  }

  function unlockGetTokenButton() {
    getTokenButton.disabled = false;
    getTokenButton.classList.remove('disabled');
  }

  function updateUI(token) {
    tokenInput.value = token;
    lockGetTokenButton();
  }

  chrome.storage.local.get(['yandexMusicToken'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при загрузке токена из хранилища:', chrome.runtime.lastError);
      return;
    }
    if (result.yandexMusicToken) {
      updateUI(result.yandexMusicToken);
    } else {
      unlockGetTokenButton();
    }
  });

  getTokenButton.addEventListener('click', () => {
    lockGetTokenButton();
    chrome.runtime.sendMessage({ action: 'openAuthPage' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Ошибка при отправке сообщения:', chrome.runtime.lastError);
        alert('Ошибка: ' + chrome.runtime.lastError.message);
        unlockGetTokenButton();
      }
    });
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'tokenUpdated' && request.token) {
      updateUI(request.token);
    } else if (request.action === 'authFailed') {
      unlockGetTokenButton();
      alert('Не удалось получить токен. Попробуйте снова.');
    }
  });

  keyIcon.addEventListener('click', () => {
    if (tokenInput.type === 'password') {
      tokenInput.type = 'text';
      keyIcon.classList.add('showing');
    } else {
      tokenInput.type = 'password';
      keyIcon.classList.remove('showing');
    }
  });
});
