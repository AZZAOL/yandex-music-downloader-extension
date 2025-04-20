document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('tokenInput');
  const getTokenButton = document.getElementById('getTokenButton');
  const keyIcon = document.querySelector('.input-container i');

  // Функция для блокировки UI
  function lockUI() {
    tokenInput.disabled = true;
    keyIcon.style.pointerEvents = 'auto'; // Включаем кликабельность иконки
    getTokenButton.disabled = true;
    getTokenButton.classList.add('disabled');
    tokenInput.style.backgroundColor = '#333';
  }

  // Функция для обновления UI с токеном
  function updateUI(token) {
    tokenInput.value = token;
    lockUI();
  }

  // Загружаем сохранённый токен
  chrome.storage.local.get(['yandexMusicToken'], (result) => {
    if (result.yandexMusicToken) {
      updateUI(result.yandexMusicToken);
    }
  });

  // Обработчик кнопки "Получить токен"
  if (getTokenButton) {
    getTokenButton.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'fetchToken' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка при отправке сообщения:', chrome.runtime.lastError);
          alert('Ошибка: ' + chrome.runtime.lastError.message);
        } else if (response.success) {
          updateUI(response.token);
        } else {
          alert('Ошибка: ' + response.error);
        }
      });
    });
  }

  // Слушаем обновления токена
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'tokenUpdated' && request.token) {
      updateUI(request.token);
    }
  });

  // Обработчик для иконки ключа
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