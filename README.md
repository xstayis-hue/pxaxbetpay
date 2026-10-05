# PXAXBET — хаб экосистемы PXAX

Telegram Mini App, который служит **точкой входа в экосистему PXAX**: приём заявок на возврат средств, локальная админ-панель и 3D-сцена. Из него открываются остальные продукты — AI-прогнозы, AI-компаньон, VPN и монета.

**Демо (GitHub Pages):** https://xstayis-hue.github.io/pxaxbetpay/

## Что внутри

- 📝 **Заявка на возврат средств** — форма с суммой, комментарием и чеком (base64, до 4 МБ). Заявка уходит в Apps Script-вебхук; статус доставки показывается в интерфейсе.
- 🔐 **Админ-панель** — вход по логину/паролю, список заявок, разбор «локально».
- 🌌 **3D-сцена** — Three.js с загруженным `angelica.glb`, фоновые эффекты (matrix-rain, parallax, burst), переключаемые при скрытой вкладке.
- 🧩 **Блок экосистемы** — плитки-ссылки на ботов и приложения: `@pxaxbetai_bot` (AI-прогнозы), `@PxAxAi_bot` (3D AI-компаньон), `@phxcryptocoin_bot` (VPHX), `@Vphoenixx_bot` (VPN).
- 📡 **Живой сигнал дня** — читает `data/predictions.json` из репозитория прогнозов и показывает топ-матч с таймером до старта.
- 📱 **Telegram WebApp SDK**, хаптика, тема; адаптивная вёрстка под мобильные.

## Структура

```
index.html          — приложение одним файлом (форма, админка, 3D-сцена, экосистема)
angelica.glb        — 3D-модель для сцены (~9 МБ)
coin-preview.html   — отдельный предпросмотр 3D-монеты (локальная разработка)
LICENSE
```

## Запуск локально

Приложение статическое; нужен любой статический сервер (ES-модули не работают с `file://`):

```bash
npx serve .
# или для предпросмотра монеты:
node server/preview.mjs   # http://localhost:8321/coin-preview.html
```

Конфиг — константы в начале скрипта в `index.html`:

```js
APPS_SCRIPT_URL   // вебхук для заявок (Google Apps Script)
PREDICT_FEED      // фид прогнозов (data/predictions.json из pxax-predict)
```

## Локальный бэкенд (`server/`)

**PXAX Core API** — единый backend экосистемы: пользователи, кошельки, подписки и заявки на возврат. Express + SQLite (`better-sqlite3`).

```bash
cd server
npm install                 # нативная сборка лучше-sqlite3 требует Visual Studio Build Tools (C++)
cp .env.example .env        # заполни PXAX_BOT_TOKEN и PXAX_ADMIN_KEY
npm start                   # http://localhost:3000
npm test                    # 6 проверок: initData HMAC + кошельки
```

Роуты:

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/health` | готовность сервиса и наличие токена |
| GET | `/api/me` | профиль, кошельки и подписки (initData обязателен) |
| POST | `/api/refund-requests` | создать заявку на возврат |
| GET | `/api/refund-requests/mine` | свои заявки |
| GET | `/api/admin/refund-requests` | все заявки (нужен `Authorization: Bearer <PXAX_ADMIN_KEY>`) |

Авторизация — проверка Telegram `initData` по HMAC-SHA256; без валидной подписи роуты возвращают `invalid_init_data`. Админ-роуты защищены отдельным ключом, который в репозиторий не попадает.

## Экосистема PXAX

| Продукт | Ссылка | Что это |
|---|---|---|
| PxAxAi | https://xstayis-hue.github.io/PxAxAi/ | 3D AI-компаньон в комнате |
| Прогнозы | https://xstayis-hue.github.io/pxax-predict/ | AI-прогнозы на спорт |
| PHXcoin | https://xstayis-hue.github.io/PHXcoin/ | VPHX — пре-лонч концепт |
| Vph | https://xstayis-hue.github.io/Vph/ | VPN-подписки |

## Лицензия

MIT (см. [LICENSE](LICENSE)).