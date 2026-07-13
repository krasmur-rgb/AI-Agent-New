# Рыночные данные: MOEX ISS + ЦБ (рецепты)

Цены/ликвидность/кривая и макро. Иерархия источников — в `../../ru-market-shared/references/sources.md`;
здесь — как именно тянуть. Через `web_fetch`/HTTP GET (ISS без авторизации, чище браузера). Каждое
число — с as-of; рынок закрыт/устарело → пометь `*`.

## MOEX ISS — как тянуть котировки

- **Борды:** ОФЗ — **TQOB**; корп/замещающие обычно **TQCB** (реже TQIR/TQRD/TQUD); фонды (БПИФ/ETF)
  — **TQTF**; эквити — **TQBR**. Борд **не hardcode** — неизвестен → резолвь (ниже).
- **SECID ≠ ISIN.** У многих корпов `SECID`=ISIN, но у ОФЗ (`SU26221RMFS0`) и фондов (`TOFZ`) — нет.
  Не подставляй ISIN в путь вслепую — сначала резолвь:
  `https://iss.moex.com/iss/securities.json?q={ISIN}` → `secid` + `primary_boardid`.
- **Bulk по борду одним запросом** (эффективнее позапросно — так строятся и кривая, и скринер):
  `.../iss/engines/stock/markets/bonds/boards/{BOARD}/securities.json?iss.meta=off&securities.columns=SECID,SHORTNAME,ISIN,MATDATE,OFFERDATE,FACEVALUE,FACEUNIT,ACCRUEDINT,COUPONPERCENT&marketdata.columns=SECID,LAST,BID,OFFER,WAPRICE,YIELD,DURATION,VALTODAY,NUMTRADES,TIME`
  → джойни `securities`↔`marketdata` по `SECID`. Частичный ответ/cursor → пагинируй через `start=`
  (сначала проверь размер ответа — board-эндпоинт часто отдаёт весь борд сразу; без проверки blind-loop не гони).
- **Одна бумага:** `.../engines/{e}/markets/{m}/securities/{SECID}.json?iss.meta=off&iss.only=securities,marketdata`.

### Цена и оценка (гочи — проверено)
- Цена облигации в ISS — **% к номиналу**. Чистая стоимость = `цена% × FACEVALUE/100 × LOTSIZE`
  (рублёвый номинал 1000, лот 1 → попросту **цена% × 10 ₽**). **Грязная оценка** = чистая + **НКД**
  (`ACCRUEDINT`, на дату расчётов). В приложении брокера стакан/заявка — в рублях, **ЧИСТАЯ** цена;
  НКД брокер добавляет сам.
- **FACEVALUE/FACEUNIT бери из ISS, не угадывай.** Амортизированные секьюритизации — номинал < 1000
  (напр. ~622) → оценка по 1000 завысит **в разы**. Валютные/замещающие (напр. Норникель) — `FACEUNIT=USD`,
  номинал часто 100 → ₽ = кол-во × цена% × FACEVALUE/100 × FX (если `FACEUNIT≠SUR` — пересчёт через FX;
  `ACCRUEDINT` уже может быть в валюте расчётов).
- **DURATION — в ДНЯХ** → /365 для лет.
- **YIELD/DURATION есть прямо в `marketdata`** (для live-кривой/скрина cbonds не нужен — он для рейтингов/
  флагов/проспектов). `YIELD` — доходность по **последней сделке**: у неликвида может быть stale → сверяй `TIME`.
- **Нет/устарела `LAST`** → fallback: `WAPRICE`→`MARKETPRICE`→`LCLOSEPRICE`→`PREVADMITTEDQUOTE`→
  `securities.PREVPRICE`→ брокер-mark. Фиксируй борд + дату, помечай `*`.
- **Фонды денежного рынка** (LQDT/TMON) — цена пая на TQTF; стоимость позиции = кол-во паёв × цена.

## Кривая ОФЗ (для режима)
- Bulk **TQOB** → только **рублёвые ОФЗ-ПД (фикс-купон)**; исключи флоутеры (ОФЗ-ПК), линкеры (ОФЗ-ИН),
  амортизируемые, `FACEUNIT≠SUR`, бумаги с нулевой/пустой дюрацией. Точки ~2/~5/~10 лет → YTM+дюрация.
  Форма = спред 2/10 (и спред к ключу). RGBI — контекст, не сама кривая.

## Скринер замены (кандидаты)
- Bulk нужного борда → фильтр по `DURATION` (окно цели), `YIELD` (диапазон качества), `VALTODAY`/`NUMTRADES`
  (ликвидность; **объём позиции vs дневной оборот** — чтобы лимитка налилась без продавливания). Шорт-лист →
  верифицируй рейтинги/флаги/оферту по **cbonds** (ISIN-gate); без подписки cbonds — по сайтам
  агентств / открытому cbonds (фолбэк — `../../ru-market-shared/references/sources.md`). Кандидаты — из скринера, **не из памяти**.

## ЦБ РФ
- **Ключевая ставка + сигнал:** cbr.ru (`hd_base/KeyRate`) — значение + дата вступления + заседание/прогноз.
- **Курсы:** `https://www.cbr.ru/scripts/XML_daily.asp` (XML, кодировка cp1251); JSON-зеркало
  `https://www.cbr-xml-daily.ru/daily_json.js` — fallback. USD/CNY/EUR + дата.

## Эквити: дивиденды, веса индекса, free-float
- **Резолв тикера:** `https://iss.moex.com/iss/securities.json?q={ISIN|тикер}` → `secid` +
  `primary_boardid` (эквити обычно **TQBR**, но борд резолвь, не hardcode).
- **Котировка/оборот:** `.../engines/stock/markets/shares/boards/{BOARD}/securities/{SECID}.json?iss.meta=off&iss.only=securities,marketdata`
  → `LAST/WAPRICE/...` (тот же fallback-каскад, что для облигаций) + `VALTODAY/NUMTRADES`.
- **Дивиденды:** `https://iss.moex.com/iss/securities/{SECID}/dividends.json?iss.meta=off`
  → колонки `registryclosedate` (отсечка) + `value` (DPS) + `currencyid` (проверено: SBER
  отдаёт историю). Это **история/объявленные**; будущие/прогноз подтверждай раскрытием
  эмитента (sanity-gate).
- **Веса в индексе:** `https://iss.moex.com/iss/statistics/engines/stock/markets/index/analytics/{INDEX}.json?iss.meta=off`
  (напр. `IMOEX`) → колонки `secids` + `weight` (+ `tradedate` как as-of; проверено). Вес ≈
  относительный размер free-float-капитализации, но **сам коэффициент free-float этот
  эндпоинт НЕ отдаёт**.
- **Free-float:** не в analytics → бери из **раскрытия эмитента / карточки бумаги на
  MOEX**; имя поля резолвь по факту, не угадывай.
- Эквити-фундаментал (прибыль/EBITDA/долг для мультипликаторов) ISS **не** отдаёт —
  считаем из МСФО (`../../ru-market-shared/references/equity-fundamentals.md`).
## Кривая для MC: MOEX G-curve (КБД) + история
- **Сегодня:** `https://iss.moex.com/iss/engines/stock/zcyc.json?iss.meta=off` → блок
  `yearyields` (сроки 0.25–20y, value=доходность) + `params` (B1/B2/B3=β0/β1/β2, T1=τ,
  G1–G9). Это уже подогнанная расширенная Nelson-Siegel — **не фитим сами**.
- **История** (для PCA-факторов level/slope/curvature и вола): тот же URL + `from=YYYY-MM-DD`
  (доступно с 2014-01-06). Тянет `quant/data.py`.
- **Ставка/RUONIA для возврата к среднему:** CBR (`cbr.ru/.../KeyRate`); RUONIA/RGBI/ОФЗ-история
  — подтверждай эндпоинт при калибровке, помечай as-of.

## Маршрут по классам (полная иерархия — `../../ru-market-shared/references/sources.md`)
- Фонды / эквити / облигации (цена, YTM, дюрация, оборот) → **MOEX ISS**.
- Рейтинги / оферты / амортизация / проспекты → **cbonds**.
- Ставка / курс / RGBI → **ЦБ / MOEX**.
- Стоимость портфеля (mark) → **рыночная оценка брокера** (первична).
