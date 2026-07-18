(function () {
  'use strict';

  // DEV-account-only visual fixtures for the marketplace.
  // Removal: delete this file and its two script tags in index.html/item.html.
  // No row is inserted into Supabase, Stripe is never called for these IDs.
  const disabled = new URLSearchParams(window.location.search).get('test_products') === '0';

  const option = (id, label, price) => ({ id, label, minimum_price_yen: price, price_yen: price });
  const products = [
    {
      id: '00000000-0000-4000-8000-000000000101',
      title: '魔王さま ミニキャラクター素材',
      creator_display_name: 'れいね',
      tags: ['キャラクター', 'ゲーム', 'かわいい'],
      favorite_count: 128,
      derivative_count: 2,
      description: 'ゲーム、プロフィール、配信画面の確認に使える小さなドットキャラクターのテスト商品です。',
      sale_price_yen: 500,
      asset_format: 'png',
      included_formats: ['png', 'webp'],
      preview_object_path: '../character-dots/maousama.png',
      published_at: '2026-07-17T10:01:00Z',
      source_kind: 'external',
      ai_usage_status: 'not-used',
      series: {
        required_option_price_yen: 0,
        derivative_sales_allowed: true,
        inherited_terms: { license_options: [option('commercial-use', '商用・収益化利用', 500)] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      title: 'くらげ ドットアニメーション',
      creator_display_name: 'ARTA',
      tags: ['アニメーション', '海', '配信'],
      favorite_count: 86,
      derivative_count: 0,
      parent_asset_id: '00000000-0000-4000-8000-000000000101',
      description: 'GIF商品のカード、アニメーション絞り込み、商品詳細を確認するためのテスト商品です。',
      sale_price_yen: 800,
      asset_format: 'gif',
      included_formats: ['gif', 'png'],
      preview_object_path: '../portfolio/dots/kurage800.gif',
      published_at: '2026-07-17T10:02:00Z',
      source_kind: 'external',
      ai_usage_status: 'used',
      series: {
        required_option_price_yen: 500,
        derivative_sales_allowed: false,
        inherited_terms: { license_options: [option('commercial-use', '商用・収益化利用', 500)] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000103',
      title: 'JELLNALL 表情アイコンセット',
      creator_display_name: 'PiXiEED Studio',
      tags: ['アイコン', '表情', 'UI'],
      favorite_count: 54,
      derivative_count: 0,
      parent_asset_id: '00000000-0000-4000-8000-000000000101',
      description: '複数形式とグッズ利用オプションの表示を確認するためのアイコン素材テスト商品です。',
      sale_price_yen: 1500,
      asset_format: 'png',
      included_formats: ['png', 'webp', 'sprite-sheet-png'],
      preview_object_path: '../character-dots/JELLNALL16.png',
      published_at: '2026-07-17T10:03:00Z',
      source_kind: 'external',
      series: {
        required_option_price_yen: 1000,
        derivative_sales_allowed: true,
        inherited_terms: { license_options: [option('merchandise-use', 'グッズ・印刷販売', 1000)] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000104',
      title: 'QRコード装飾スターター',
      creator_display_name: 'PiXiEED QR',
      tags: ['QR', '装飾', 'スターター'],
      favorite_count: 203,
      derivative_count: 0,
      description: '最低販売価格500円とPNG素材の商品詳細を確認するためのテスト商品です。',
      sale_price_yen: 500,
      asset_format: 'png',
      included_formats: ['png'],
      preview_object_path: '../qr-maker/original.png',
      published_at: '2026-07-17T10:04:00Z',
      source_kind: 'pixieed-native',
      series: {
        required_option_price_yen: 0,
        derivative_sales_allowed: false,
        inherited_terms: { license_options: [] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000105',
      title: 'ピクセルワールド 背景パック',
      creator_display_name: 'PiXiEED Studio',
      tags: ['背景', 'ゲーム', '風景'],
      favorite_count: 97,
      derivative_count: 1,
      description: '横長プレビュー、商用利用、価格順の確認に使う背景素材のテスト商品です。',
      sale_price_yen: 2200,
      asset_format: 'png',
      included_formats: ['png', 'webp'],
      preview_object_path: '../assets/hero/pixieed-pixel-world-hero.png',
      published_at: '2026-07-17T10:05:00Z',
      source_kind: 'external',
      series: {
        required_option_price_yen: 500,
        derivative_sales_allowed: true,
        inherited_terms: { license_options: [option('commercial-use', '商用・収益化利用', 500)] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000106',
      title: 'PiXiEEDraw レイヤー付きサンプル',
      creator_display_name: 'れいね',
      tags: ['PiXiEEDraw', 'レイヤー', '編集可能'],
      favorite_count: 164,
      derivative_count: 0,
      parent_asset_id: '00000000-0000-4000-8000-000000000105',
      description: 'PiXiEEDraw形式、PNG出力、派生販売可能表示を確認するためのプロジェクト商品です。',
      sale_price_yen: 1200,
      asset_format: 'pixiedraw-project',
      included_formats: ['pixiedraw-project', 'png'],
      preview_object_path: '../assets/screenshots/generated/pixiedraw-maousama-canvas.png',
      published_at: '2026-07-17T10:06:00Z',
      source_kind: 'pixieed-native',
      series: {
        required_option_price_yen: 800,
        derivative_sales_allowed: true,
        inherited_terms: {
          license_options: [option('commercial-use', '商用・収益化利用', 800)]
        }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000107',
      title: 'PiXiEEDraw キャラクター制作テンプレート',
      creator_display_name: 'PiXiEED Studio',
      tags: ['PiXiEEDraw', 'テンプレート', 'キャラクター'],
      favorite_count: 142,
      derivative_count: 3,
      description: 'レイヤー構成を保ったままPiXiEEDrawで開き、キャラクター制作を始められるDEVアカウント限定テスト商品です。',
      sale_price_yen: 1800,
      asset_format: 'pixiedraw-project',
      included_formats: ['pixiedraw-project', 'png', 'webp'],
      limited_quantity: 12,
      limited_sold_count: 7,
      preview_object_path: '../assets/screenshots/generated/pixiedraw-color.png',
      published_at: '2026-07-17T10:07:00Z',
      source_kind: 'pixieed-native',
      series: {
        required_option_price_yen: 500,
        derivative_sales_allowed: true,
        inherited_terms: { license_options: [option('commercial-use', '商用・収益化利用', 500)] }
      }
    },
    {
      id: '00000000-0000-4000-8000-000000000108',
      title: 'PiXiEEDraw 限定レイヤー作品',
      creator_display_name: 'れいね',
      tags: ['PiXiEEDraw', '限定', 'レイヤー'],
      favorite_count: 231,
      derivative_count: 0,
      description: 'SOLD OUT表示と購入不可状態を確認する、レイヤー付きPiXiEEDraw作品のDEVアカウント限定テスト商品です。',
      sale_price_yen: 2500,
      asset_format: 'pixiedraw-project',
      included_formats: ['pixiedraw-project', 'png'],
      limited_quantity: 5,
      limited_sold_count: 5,
      preview_object_path: '../assets/screenshots/generated/pixiedraw-maousama-canvas.png',
      published_at: '2026-07-17T10:08:00Z',
      source_kind: 'pixieed-native',
      series: {
        required_option_price_yen: 0,
        derivative_sales_allowed: false,
        inherited_terms: { license_options: [] }
      }
    }
  ].map((product) => Object.freeze({
    creator_user_id: '00000000-0000-4000-8000-000000000001',
    verification_status: 'local-test',
    seller_identity_verified: false,
    local_test: true,
    limited_quantity: null,
    limited_sold_count: 0,
    ...product
  }));

  let visibleProducts = Object.freeze([]);
  const ready = (async () => {
    const access = window.PiXiEEDDevAccess
      ? await window.PiXiEEDDevAccess.check()
      : { allowed: false };
    visibleProducts = access.allowed && !disabled ? Object.freeze(products) : Object.freeze([]);
    return visibleProducts;
  })();
  window.PiXiEEDMarketLocalTestProducts = Object.freeze({
    get enabled() { return visibleProducts.length > 0; },
    get products() { return visibleProducts; },
    ready,
    getById(id) {
      return visibleProducts.find((product) => product.id === String(id || '')) || null;
    }
  });
})();
