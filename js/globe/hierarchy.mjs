/**
 * Explicit Japan hierarchy used by the globe prototype.
 *
 * The nine groups mirror the existing Studio definitions in js/app.js.  The
 * prefecture codes are the GeoJSON authority; no geographic nearest-neighbor
 * inference is used here.
 */

export const JAPAN_COUNTRY_ID = 'JPN';

export const JAPAN_PREFECTURES = Object.freeze([
  ['01', '北海道'], ['02', '青森県'], ['03', '岩手県'], ['04', '宮城県'], ['05', '秋田県'], ['06', '山形県'], ['07', '福島県'],
  ['08', '茨城県'], ['09', '栃木県'], ['10', '群馬県'], ['11', '埼玉県'], ['12', '千葉県'], ['13', '東京都'], ['14', '神奈川県'],
  ['15', '新潟県'], ['16', '富山県'], ['17', '石川県'], ['18', '福井県'], ['19', '山梨県'], ['20', '長野県'], ['21', '岐阜県'],
  ['22', '静岡県'], ['23', '愛知県'], ['24', '三重県'], ['25', '滋賀県'], ['26', '京都府'], ['27', '大阪府'], ['28', '兵庫県'],
  ['29', '奈良県'], ['30', '和歌山県'], ['31', '鳥取県'], ['32', '島根県'], ['33', '岡山県'], ['34', '広島県'], ['35', '山口県'],
  ['36', '徳島県'], ['37', '香川県'], ['38', '愛媛県'], ['39', '高知県'], ['40', '福岡県'], ['41', '佐賀県'], ['42', '長崎県'],
  ['43', '熊本県'], ['44', '大分県'], ['45', '宮崎県'], ['46', '鹿児島県'], ['47', '沖縄県']
]);

export const JAPAN_REGION_GROUPS = Object.freeze([
  Object.freeze({ id: 'hokkaido', label: '北海道', codes: Object.freeze(['01']) }),
  Object.freeze({ id: 'tohoku', label: '東北', codes: Object.freeze(['02', '03', '04', '05', '06', '07']) }),
  Object.freeze({ id: 'kanto', label: '関東', codes: Object.freeze(['08', '09', '10', '11', '12', '13', '14']) }),
  Object.freeze({ id: 'hokuriku-koshinetsu', label: '北陸・甲信越', codes: Object.freeze(['15', '16', '17', '18', '19', '20']) }),
  Object.freeze({ id: 'tokai', label: '東海', codes: Object.freeze(['21', '22', '23', '24']) }),
  Object.freeze({ id: 'kinki', label: '近畿', codes: Object.freeze(['25', '26', '27', '28', '29', '30']) }),
  Object.freeze({ id: 'chugoku', label: '中国', codes: Object.freeze(['31', '32', '33', '34', '35']) }),
  Object.freeze({ id: 'shikoku', label: '四国', codes: Object.freeze(['36', '37', '38', '39']) }),
  Object.freeze({ id: 'kyushu-okinawa', label: '九州・沖縄', codes: Object.freeze(['40', '41', '42', '43', '44', '45', '46', '47']) })
]);

const PREFECTURE_NAME_BY_CODE = new Map(JAPAN_PREFECTURES);
const REGION_BY_CODE = new Map(
  JAPAN_REGION_GROUPS.flatMap((region) => region.codes.map((code) => [code, region]))
);

export function getPrefectureName(code) {
  return PREFECTURE_NAME_BY_CODE.get(String(code)) || null;
}

export function getRegionForPrefecture(code) {
  return REGION_BY_CODE.get(String(code)) || null;
}

export function createJapanHierarchy(records = []) {
  const input = Array.from(records);
  const codes = input.map((record) => String(record.code ?? record.properties?.code ?? record.id ?? ''));
  const expected = new Set(JAPAN_PREFECTURES.map(([code]) => code));
  const actual = new Set(codes);
  if (actual.size !== expected.size || [...expected].some((code) => !actual.has(code))) {
    throw new RangeError('Japan hierarchy requires exactly the 47 prefecture codes 01 through 47.');
  }
  if (codes.length !== expected.size) throw new RangeError('Japan prefecture codes must not overlap.');
  return Object.freeze({
    countryId: JAPAN_COUNTRY_ID,
    regions: JAPAN_REGION_GROUPS,
    prefectures: Object.freeze(input.map((record) => Object.freeze({
      ...record,
      code: String(record.code ?? record.properties?.code ?? record.id),
      name: record.name || record.properties?.['name:ja'] || getPrefectureName(record.code)
    })))
  });
}

export function assertCompleteJapanRegions() {
  const assigned = JAPAN_REGION_GROUPS.flatMap((region) => region.codes);
  const expected = JAPAN_PREFECTURES.map(([code]) => code);
  if (assigned.length !== 47 || new Set(assigned).size !== 47 || assigned.some((code, index) => code !== expected[index])) {
    throw new Error('Japan region definitions must cover each prefecture exactly once in geographic order.');
  }
  return true;
}

assertCompleteJapanRegions();
