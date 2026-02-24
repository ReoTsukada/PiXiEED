import { startResidentRoom } from './resident-room.js';

startResidentRoom({
  roomId: 'resident-256',
  title: '常駐ルーム 256x256',
  description: '最大10人。全員が同時参加できる常駐ルームです。描いたピクセルは他人が塗り替えできません。',
  defaultChannel: 'resident-256-main',
  width: 256,
  height: 256,
  maxUsers: 10,
  mode: 'free-no-overwrite',
}).catch(error => {
  console.error('Failed to start resident 256 room', error);
});
