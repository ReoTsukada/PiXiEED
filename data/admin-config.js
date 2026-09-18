/*
 * 管理ページの公開設定。
 * OAuth クライアントID、スプレッドシートID、管理者メールアドレスは
 * 公開リポジトリに置いても秘密情報ではありません。秘密鍵やサービスアカウント鍵は置きません。
 */
export const adminConfig = {
  googleOAuthClientId: '193223571632-ods2kpic9o9rlgal65jpbt2blfc94a0t.apps.googleusercontent.com',
  spreadsheetId: '1wY0GCiYVi3SZelNhWDsO0Xobq7moK3bQ4u3YU2-u2Ms',
  adminEmail: 'rgaydm03@gmail.com',
  sheets: {
    works: 'Works',
    stores: 'Stores',
    storeWorks: 'StoreWorks',
    events: 'Events',
    eventSources: 'EventSources',
    analyticsDaily: 'AnalyticsDaily'
  }
};
