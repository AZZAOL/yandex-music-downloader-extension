from flask import Flask, request, jsonify, Response, send_file
from flask_cors import CORS
from yandex_music import Client
import logging
import requests
import io
import re

app = Flask(__name__)
CORS(app, expose_headers=['Content-Disposition'])

logging.basicConfig(level=logging.INFO)

# Маршрут для получения информации о треке
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
        preferred_bitrates = [320, 192, 128]
        for info in download_info:
            if info.codec == 'mp3' and info.bitrate_in_kbps in preferred_bitrates:
                try:
                    direct_link = info.get_direct_link()
                    if direct_link:
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

        selected_bitrate = next((bitrate for bitrate in preferred_bitrates if bitrate in available_formats), None)
        if not selected_bitrate:
            return jsonify({'error': 'Нет доступных mp3 форматов в указанных битрейтах'}), 404

        # Формируем имя файла
        # Собираем всех исполнителей
        artists = [artist.name for artist in track.artists] if track.artists else ["Неизвестный исполнитель"]
        artist_str = ", ".join(artists)
        title = track.title

        # Проверяем наличие версии
        version = getattr(track, 'version', None)
        logging.info(f"Track ID: {track_id}, Title: {title}, Version: {version}, Artists: {artists}")

        # Формируем заголовок с учётом version
        if version and version.lower() not in title.lower():
            title = f"{title} {version}"

        base_filename = f"{artist_str} - {title}"
        base_filename = re.sub(r'[<>:"/\\|?*]', '', base_filename)
        base_filename = re.sub(r'\s+', ' ', base_filename).strip()
        main_filename = f"{base_filename}.mp3"
        logging.info(f"Сформированное имя файла: {main_filename}")

        urls = {str(bitrate): available_formats[bitrate] for bitrate in available_formats}
        filenames = {str(bitrate): f"{base_filename}_{bitrate}kbps.mp3" for bitrate in available_formats}

        response_data = {
            'url': available_formats[selected_bitrate],
            'filename': main_filename,
            'urls': urls,
            'filenames': filenames
        }

        return jsonify(response_data), 200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }

    except Exception as e:
        logging.error(f'Ошибка: {str(e)}')
        return jsonify({'error': str(e)}), 500

# Маршрут для скачивания трека
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
