const CONFIG = {
  API_BASE_URL: 'http://localhost:5000',
  TIMEOUT: 120000,
  MESSAGES: {
    download: 'Скачать',
    error: 'Ошибка',
    noToken: 'Пожалуйста, укажите действительный токен в настройках расширения',
    noTrackData: 'URL или имя файла не найдены в ответе сервера',
    trackNotFound: 'Ссылка на трек не найдена',
    timeout: 'Сервер отвечает слишком долго, попробуйте позже'
  },
  SELECTORS: {
    tracks: [
      '.Meta_title__GGBnH:not([data-processed])',
      'a[href*="/track/"] span:not([data-processed])',
      '.track__title:not([data-processed])',
      '[data-testid="track-title"]:not([data-processed])',
      '.current-track:not([data-processed])'
    ]
  }
};

const STYLES = {
  button: {
    '--border-color': 'rgba(255, 255, 255, 0.2)',
    '--shadow': '0 2px 6px rgba(0, 0, 0, 0.15)',
    '--hover-shadow': '0 4px 12px rgba(0, 0, 0, 0.2), 0 0 8px rgba(255, 255, 255, 0.1)',
    '--disabled-opacity': '0.7',
    marginLeft: '8px',
    cursor: 'pointer',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    color: '#ffffff',
    border: '1px solid var(--border-color)',
    padding: '0',
    borderRadius: '50%',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    lineHeight: '1',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    zIndex: '10',
    boxShadow: 'var(--shadow)',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease'
  },
  hover: {
    transform: 'scale(1.1)',
    boxShadow: 'var(--hover-shadow)'
  },
  downloading: {
    cursor: 'default',
    opacity: 'var(--disabled-opacity)'
  }
};

const showError = (message) => {
  const displayMessage = message.includes('timeout') ? CONFIG.MESSAGES.timeout : message;
  alert(`${CONFIG.MESSAGES.error}: ${displayMessage}`);
};

const applyStyles = (element, styles) => Object.assign(element.style, styles);

const getTrackId = (link) => link.href.match(/track\/(\d+)/)?.[1];

const createDownloadButton = () => {
  const button = document.createElement('button');
  button.className = 'download-btn';
  button.setAttribute('aria-label', CONFIG.MESSAGES.download);
  button.title = CONFIG.MESSAGES.download;
  button.innerHTML = `
    <svg class="download-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 15V3m0 12l-4-4m4 4l4-4M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    </svg>
  `;
  applyStyles(button, STYLES.button);
  let isProcessing = false;
  button.addEventListener('mouseenter', () => {
    if (!button.classList.contains('downloading')) {
      applyStyles(button, STYLES.hover);
    }
  });
  button.addEventListener('mouseleave', () => {
    if (!button.classList.contains('downloading')) {
      applyStyles(button, { transform: 'scale(1)', boxShadow: STYLES.button.boxShadow });
    }
  });
  button.addEventListener('click', () => {
    if (!button.classList.contains('downloading')) {
      button.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(0.9)' },
        { transform: 'scale(1)' }
      ], { duration: 150, easing: 'ease-in-out' });
    }
  });
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (isProcessing) return;
    isProcessing = true;
    button.classList.add('downloading');
    button.innerHTML = `
      <svg class="spinner" viewBox="0 0 24 24" width="14" height="14">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="15 45" stroke-linecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
        </circle>
      </svg>
    `;
    applyStyles(button, STYLES.downloading);
    button.disabled = true;
    try {
      const { yandexMusicToken: token } = await chrome.storage.local.get(['yandexMusicToken']);
      if (!token?.trim()) throw new Error(CONFIG.MESSAGES.noToken);
      const link = button.closest('a[href*="/track/"]');
      if (!link) throw new Error(CONFIG.MESSAGES.trackNotFound);
      const trackId = getTrackId(link);
      if (!trackId) throw new Error('ID трека не найден');
      console.log('Запрос трека:', trackId);
      const trackInfo = await fetchTrackInfo(trackId, token);
      console.log('Данные трека:', trackInfo);
      if (trackInfo.error) throw new Error(trackInfo.error);
      if (!trackInfo.url || !trackInfo.filename) throw new Error(CONFIG.MESSAGES.noTrackData);
      console.log('Скачивание:', trackInfo.filename);
      const { blob, filename } = await downloadTrack(trackInfo.url, trackInfo.filename);
      initiateDownload(blob, filename);
      console.log('Завершено:', filename);
    } catch (error) {
      showError(error.message);
    } finally {
      resetButton(button);
      isProcessing = false;
    }
  });
  return button;
};

const resetButton = (button) => {
  button.classList.remove('downloading');
  button.innerHTML = `
    <svg class="download-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 15V3m0 12l-4-4m4 4l4-4M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    </svg>
  `;
  applyStyles(button, STYLES.button);
  button.disabled = false;
};

const fetchWithRetry = async (url, options, retries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (attempt === retries || !error.message.includes('timeout')) {
        throw error;
      }
      console.warn(`Попытка ${attempt} не удалась: ${error.message}. Повтор через ${delay} мс...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

const fetchTrackInfo = async (trackId, token) => {
  console.log(`Отправка запроса на /get_track_info для trackId: ${trackId}`);
  const response = await fetchWithRetry(`${CONFIG.API_BASE_URL}/get_track_info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, track_id: trackId }),
    signal: AbortSignal.timeout(CONFIG.TIMEOUT)
  });
  const data = await response.json();
  console.log(`Ответ от /get_track_info:`, data);
  return data;
};

const downloadTrack = async (url, filename) => {
  const response = await fetchWithRetry(`${CONFIG.API_BASE_URL}/download_track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename }),
    signal: AbortSignal.timeout(CONFIG.TIMEOUT)
  });
  const blob = await response.blob();
  return { blob, filename };
};

const initiateDownload = (blob, filename) => {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
  // Отображаем уведомление о завершении загрузки
  showNotification(`Трек "${filename}" скачан`);
};

const addDownloadButtons = () => {
  const trackElements = document.querySelectorAll(CONFIG.SELECTORS.tracks.join(','));
  document.querySelectorAll('[data-processed]').forEach(el => {
    if (!Array.from(trackElements).includes(el)) {
      el.removeAttribute('data-processed');
    }
  });
  trackElements.forEach(trackElement => {
    const link = trackElement.closest('a[href*="/track/"]');
    if (!link) {
      console.log('Ссылка на трек не найдена:', trackElement.outerHTML);
      return;
    }
    const container = link.parentElement;
    if (!container || container.querySelector('.download-btn')) {
      return;
    }
    const trackId = getTrackId(link);
    if (!trackId) {
      console.log('ID трека не найден:', link.href);
      return;
    }
    const downloadBtn = createDownloadButton();
    const metaContainer = link.querySelector('span:last-child') || link;
    metaContainer.insertAdjacentElement('afterend', downloadBtn);
    trackElement.setAttribute('data-processed', 'true');
  });
};

const initStyles = () => {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --btn-border: ${STYLES.button['--border-color']};
      --btn-shadow: ${STYLES.button['--shadow']};
      --btn-hover-shadow: ${STYLES.button['--hover-shadow']};
      --btn-disabled-opacity: ${STYLES.button['--disabled-opacity']};
    }
    .download-btn {
      position: relative;
      overflow: hidden;
      background: none;
      border: 1px solid var(--btn-border);
      box-shadow: var(--btn-shadow);
      backdrop-filter: ${STYLES.button.backdropFilter};
      -webkit-backdrop-filter: ${STYLES.button.WebkitBackdropFilter};
      transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    }
    .download-btn:hover:not(.downloading) {
      boxShadow: var(--btn-hover-shadow);
      transform: scale(1.1);
    }
    .download-btn.downloading {
      opacity: var(--btn-disabled-opacity);
      cursor: default;
      transform: scale(1);
    }
    .download-btn:hover::after {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }
    .download-btn::after {
      content: attr(title);
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(8px);
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--btn-border);
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s ease;
    }
    .download-btn .download-icon,
    .download-btn .spinner {
      display: block;
    }
    .spinner {
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @supports not (backdrop-filter: blur(12px)) {
      .download-btn::after {
        background: rgba(26, 26, 26, 0.8);
      }
    }
  `;
  document.head.appendChild(style);
};

// Функция для создания и отображения уведомления
const showNotification = (message) => {
  let notificationsContainer = document.querySelector('.notifications-container');
  if (!notificationsContainer) {
    notificationsContainer = document.createElement('div');
    notificationsContainer.className = 'notifications-container';
    notificationsContainer.style.position = 'fixed';
    notificationsContainer.style.bottom = '20px';
    notificationsContainer.style.right = '20px';
    notificationsContainer.style.zIndex = '10000';
    document.body.appendChild(notificationsContainer);

    // Добавляем стили для контейнера уведомлений
    const style = document.createElement('style');
    style.textContent = `
      .notifications-container {
        display: flex;
        flex-direction: column-reverse;
        align-items: flex-end;
      }
      .notification {
        background-color: rgba(0, 0, 0, 0.8);
        color: #fff;
        padding: 10px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        margin-bottom: 10px;
      }
      .notification.show {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    document.head.appendChild(style);
  }

  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notificationsContainer.insertBefore(notification, notificationsContainer.firstChild);

  // Показываем уведомление
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Удаляем уведомление через 3 секунды
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notificationsContainer.removeChild(notification);
    }, 3000);
  }, 3000);
};

const init = () => {
  initStyles();
  let isProcessing = false;
  const observer = new MutationObserver(() => {
    if (isProcessing) return;
    isProcessing = true;
    addDownloadButtons();
    setTimeout(addDownloadButtons, 500);
    isProcessing = false;
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-testid']
  });
  setTimeout(addDownloadButtons, 1000);
  addDownloadButtons();
};

init();