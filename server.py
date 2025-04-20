from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from yandex_music import Client
import logging
import requests
import io
import json
from time import sleep
from selenium import webdriver
from selenium.webdriver.remote.command import Command
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

logging.basicConfig(level=logging.INFO)

# Функция для проверки активности драйвера
def is_active(driver):
    try:
        driver.execute(Command.GET_ALL_COOKIES)
        return True
    except Exception:
        return False

# Функция для получения токена через Selenium
def get_token():
    try:
        # Настройка Chrome для логирования запросов
        chrome_options = Options()
        chrome_options.add_experimental_option('perfLoggingPrefs', {
            'enableNetwork': True,
            'enablePage': True
        })
        chrome_options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})

        # Используем Service для ChromeDriver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        # Открываем страницу авторизации Яндекса
        driver.get("https://oauth.yandex.ru/authorize?response_type=token&client_id=23cabbbdc6cd418abb4b39c32c41195d")

        token = None
        while token is None and is_active(driver):
            sleep(1)
            try:
                logs_raw = driver.get_log("performance")
                for lr in logs_raw:
                    log = json.loads(lr["message"])["message"]
                    url_fragment = log.get('params', {}).get('frame', {}).get('urlFragment')
                    if url_fragment:
                        token = url_fragment.split('&')[0].split('=')[1]
            except Exception as e:
                logging.error(f"Ошибка при получении логов: {str(e)}")

        driver.quit()  # Полное закрытие браузера
        if token:
            return token
        else:
            raise Exception("Не удалось получить токен")
    except Exception as e:
        logging.error(f"Ошибка в get_token: {str(e)}")
        raise e

# Эндпоинт для получения токена
@app.route('/get_token', methods=['GET'])
def serve_token():
    try:
        token = get_token()
        return jsonify({"token": token}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Существующие маршруты
@app.route('/get_track_info', methods=['POST'])
def get_track_info():
    try:
        data = request.get_json()
        token = data.get('token')
        track_id = data.get('track_id')

        if not token or not track_id:
            return jsonify({'error': 'Токен или ID трека не указаны'}), 400

        client = Client(token=token)
        client.init()

        track = client.tracks([track_id])[0]
        download_info = track.get_download_info()

        logging.info(f"Доступные форматы для трека {track_id}: {[f'{info.codec} {info.bitrate_in_kbps}kbps' for info in download_info]}")

        # Собираем доступные битрейты (только mp3)
        available_formats = {}
        preferred_bitrates = [320, 192, 128]  # Приоритет качества
        for info in download_info:
            if info.codec == 'mp3' and info.bitrate_in_kbps in preferred_bitrates:
                try:
                    direct_link = info.get_direct_link()
                    if direct_link:
                        # Проверяем, что ссылка рабочая
                        response = requests.head(direct_link, headers={
                            'User-Agent': 'Mozilla/5.0'
                        }, allow_redirects=True)
                        if response.status_code == 200:
                            available_formats[info.bitrate_in_kbps] = direct_link
                            logging.info(f"Найдена рабочая ссылка для {info.bitrate_in_kbps}kbps: {direct_link}")
                        else:
                            logging.warning(f"Ссылка для {info.bitrate_in_kbps}kbps недоступна: {response.status_code}")
                    else:
                        logging.warning(f"Не удалось получить ссылку для {info.bitrate_in_kbps}kbps")
                except Exception as e:
                    logging.error(f"Ошибка при получении ссылки для {info.bitrate_in_kbps}kbps: {str(e)}")

        if not available_formats:
            return jsonify({'error': 'Нет доступных mp3 форматов для этого трека'}), 404

        # Выбираем основной битрейт (первый доступный из preferred_bitrates)
        selected_bitrate = next((bitrate for bitrate in preferred_bitrates if bitrate in available_formats), None)
        if not selected_bitrate:
            return jsonify({'error': 'Нет доступных mp3 форматов в указанных битрейтах'}), 404

        # Формируем имя файла
        artist = track.artists[0].name if track.artists else "Неизвестный исполнитель"
        title = track.title
        base_filename = f"{artist} - {title}"
        base_filename = ''.join(c for c in base_filename if c not in '<>:"/\\|?*')
        main_filename = f"{base_filename}.mp3"

        # Формируем объект urls с именами файлов для каждого битрейта
        urls = {
            str(bitrate): available_formats[bitrate]
            for bitrate in available_formats
        }
        filenames = {
            str(bitrate): f"{base_filename}_{bitrate}kbps.mp3"
            for bitrate in available_formats
        }

        response_data = {
            'url': available_formats[selected_bitrate],  # Основной URL (для обратной совместимости)
            'filename': main_filename,                  # Основное имя файла
            'urls': urls,                              # Все доступные URL
            'filenames': filenames                     # Имена файлов для каждого битрейта
        }

        return jsonify(response_data), 200, {'Content-Type': 'application/json; charset=utf-8'}

    except Exception as e:
        logging.error(f'Ошибка: {str(e)}')
        return jsonify({'error': str(e)}), 500

@app.route('/download_track', methods=['POST'])
def download_track():
    try:
        data = request.get_json()
        url = data.get('url')
        filename = data.get('filename')

        if not url or not filename:
            return jsonify({'error': 'URL или имя файла не указаны'}), 400

        response = requests.get(url, headers={
            'User-Agent': 'Mozilla/5.0'
        }, stream=True)
        if response.status_code != 200:
            logging.error(f"Не удалось скачать трек: {response.status_code}")
            return jsonify({'error': f'Не удалось скачать трек: {response.status_code}'}), 400

        file_stream = io.BytesIO()
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                file_stream.write(chunk)
        file_stream.seek(0)

        return send_file(
            file_stream,
            as_attachment=True,
            download_name=filename,
            mimetype='audio/mpeg'
        )

    except Exception as e:
        logging.error(f'Ошибка: {str(e)}')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='localhost', port=5000)