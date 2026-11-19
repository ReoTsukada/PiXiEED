import test from 'node:test';
import assert from 'node:assert/strict';
import { Y_SCALE, screenVectorToWorld, projectWorld, unprojectScreen, compareDepth, wallOccludesPlayer, makeCamera, makeBossCamera } from '../src/renderer.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test('2.5D projection and inverse retain world position at multiple heights', () => {
  for (const view of [{x:240,y:320,zoom:1.65,centerX:195,centerY:340}, {x:612,y:440,zoom:2.1,centerX:600,centerY:390}]) {
    for (const point of [{x:0,y:0,z:0},{x:781,y:385,z:27},{x:400,y:77,z:69}]) {
      const screen = projectWorld(point.x, point.y, point.z, view);
      const world = unprojectScreen(screen.x, screen.y, point.z, view);
      close(world.x, point.x); close(world.y, point.y);
    }
  }
});
test('screen joystick diagonal retains its screen direction after inverse projection', () => {
  for (const [x,y] of [[1,1],[-.4,.6],[0,-1],[1,0]]) {
    const vector = screenVectorToWorld(x,y);
    close(vector.x,x); close(vector.y * Y_SCALE,y);
  }
  assert.deepEqual(screenVectorToWorld(NaN,Infinity),{x:0,y:0});
});
test('height lifts a sprite without moving its ground position', () => {
  const ground=projectWorld(100,200,0), head=projectWorld(100,200,27);
  close(ground.x,head.x); close(ground.y-head.y,27);
});
test('depth order uses feet with deterministic order for equal depths', () => {
  const items=[{depth:36,order:2},{depth:20,order:9},{depth:36,order:1}];
  assert.deepEqual(items.sort(compareDepth).map(x=>x.order),[9,1,2]);
});
test('only projected foreground occlusion fades a wall', () => {
  const player={x:100,y:100};
  assert.equal(wallOccludesPlayer({x:90,y:108,height:36},player),true);
  assert.equal(wallOccludesPlayer({x:90,y:20,height:36},player),false);
  assert.equal(wallOccludesPlayer({x:170,y:108,height:36},player),false);
  assert.equal(wallOccludesPlayer({x:90,y:200,height:36},player),false);
});
test('desktop and mobile camera remain finite at map edges', () => {
  const map={width:1116,height:828};
  for (const [width,height] of [[390,600],[1280,720],[320,210]]) {
    for (const player of [{x:0,y:0},{x:558,y:414},{x:1116,y:828}]) {
      const view=makeCamera(player,map,width,height);
      assert.ok(Object.values(view).every(Number.isFinite));
      assert.ok(view.zoom>=1.65&&view.zoom<=2.1);
      assert.equal(view.width,width);assert.equal(view.height,height);
    }
  }
});

test('boss and player fit a short landscape viewport including the boss crown', () => {
  const map={width:1116,height:828}, boss={x:558,y:414};
  for (const [width,height] of [[844,390],[844,230],[390,600],[1280,720]]) {
    for (const player of [{x:558,y:664},{x:150,y:730},{x:960,y:100}]) {
      const view=makeBossCamera(player,boss,map,width,height);
      assert.ok(view.zoom>0&&view.zoom<=2.1);
      const points=[
        projectWorld(boss.x-55,boss.y,98,view),
        projectWorld(boss.x+55,boss.y,-38,view),
        projectWorld(player.x-26,player.y,36,view),
        projectWorld(player.x+26,player.y,-14,view)
      ];
      for (const point of points) {
        assert.ok(point.x>=-1e-9&&point.x<=width+1e-9,`x=${point.x} width=${width}`);
        assert.ok(point.y>=-1e-9&&point.y<=height+1e-9,`y=${point.y} height=${height}`);
      }
      const playerScreen=projectWorld(player.x,player.y,0,view);
      const inverse=unprojectScreen(playerScreen.x,playerScreen.y,0,view);
      close(inverse.x,player.x);close(inverse.y,player.y);
    }
  }
});
