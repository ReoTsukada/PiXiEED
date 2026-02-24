import { startResidentRoom } from './resident-room.js';

startResidentRoom({
  roomId: 'resident-128',
  title: '常駐ルーム 128x128',
  description: '最大16人。1人1セル(32x32)で同時制作する常駐ルームです。待機者は入室順で自動昇格します。',
  defaultChannel: 'resident-128-main',
  width: 128,
  height: 128,
  maxUsers: 16,
  mode: 'fixed-cell',
  cellSize: 32,
}).catch(error => {
  console.error('Failed to start resident 128 room', error);
});
